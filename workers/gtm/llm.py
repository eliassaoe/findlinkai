"""One place that builds the model client, so the provider is a config choice.

Anthropic direct is the default. OpenRouter works through its **Anthropic Skin**
at `https://openrouter.ai/api` — a wire-compatible Messages endpoint that handles
model mapping and passes thinking blocks and native tool use through, so the
Anthropic SDK talks to it unchanged.

    # Anthropic direct
    ANTHROPIC_API_KEY=sk-ant-...

    # OpenRouter
    LLM_PROVIDER=openrouter
    OPENROUTER_API_KEY=sk-or-...
    LLM_MODEL=anthropic/claude-opus-4.5        # optional, see below

## Two things are unverified through OpenRouter, and they are not small

- **Structured outputs** (`output_config.format`). Every agent here returns JSON
  against a schema. If the Skin drops the parameter the model still answers, but
  nothing guarantees valid JSON — a silent failure, not an error.
- **The `web_search` server tool.** That is Anthropic-hosted infrastructure, not
  a model capability, and it is what `qualifier(research=True)` uses to read a
  company's site. No source says whether the Skin forwards it.

`probe()` finds out with two small live calls instead of guessing, and
`run.py capacity` runs it. Prompt caching via per-block `cache_control` is
reported to work on Anthropic-compatible providers, so the three-block prompt
layout should survive.

Model names differ: OpenRouter uses `anthropic/claude-...` slugs. The Skin maps
models, but set `LLM_MODEL` to be sure.
"""

from __future__ import annotations

import os
from typing import Any

OPENROUTER_BASE = "https://openrouter.ai/api"

# Defaults per role. Overridable so a cheaper router model can take the volume
# work without touching code.
DEFAULT_MODELS = {
    "writer": os.environ.get("LLM_MODEL", "claude-opus-5"),
    "qualifier": os.environ.get("LLM_MODEL_QUALIFIER", "") or os.environ.get("LLM_MODEL", "claude-opus-5"),
    "classifier": os.environ.get("LLM_MODEL_CLASSIFIER", "claude-haiku-4-5"),
}


def provider() -> str:
    if os.environ.get("LLM_PROVIDER"):
        return os.environ["LLM_PROVIDER"].strip().lower()
    return "openrouter" if os.environ.get("OPENROUTER_API_KEY") else "anthropic"


def model_for(role: str) -> str:
    name = DEFAULT_MODELS.get(role, DEFAULT_MODELS["writer"])
    # OpenRouter wants a namespaced slug. Only prefix a bare Anthropic id.
    if provider() == "openrouter" and "/" not in name and name.startswith("claude-"):
        return "anthropic/" + name
    return name


def client(**kw: Any):
    """An `anthropic.Anthropic` pointed at whichever provider is configured."""
    try:
        import anthropic
    except ImportError:
        raise SystemExit("pip install anthropic")

    if provider() == "openrouter":
        key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise SystemExit("OPENROUTER_API_KEY is not set.")
        base = os.environ.get("LLM_BASE_URL", OPENROUTER_BASE)
        return anthropic.Anthropic(api_key=key, base_url=base, **kw)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise SystemExit("ANTHROPIC_API_KEY is not set (or set LLM_PROVIDER=openrouter).")
    return anthropic.Anthropic(**kw)


# --------------------------------------------------------------------------
# Capability probe
# --------------------------------------------------------------------------

_SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}},
    "required": ["ok"],
    "additionalProperties": False,
}


def probe(api: Any = None, model: str = "") -> dict[str, Any]:
    """Two tiny live calls that answer what the docs do not.

    Cheap on purpose — a few hundred tokens. Returns what worked, so the caller
    can degrade rather than discover it mid-batch.
    """
    import json

    api = api or client()
    model = model or model_for("writer")
    out: dict[str, Any] = {"provider": provider(), "model": model,
                           "reachable": False, "structured_outputs": False,
                           "web_search": False, "notes": []}

    # 1. Reachable, and does output_config.format actually constrain the answer?
    try:
        r = api.messages.create(
            model=model, max_tokens=256,
            messages=[{"role": "user", "content": "Reply with ok=true."}],
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
        )
        out["reachable"] = True
        text = next((b.text for b in r.content if b.type == "text"), "")
        try:
            out["structured_outputs"] = json.loads(text).get("ok") is True
        except Exception:
            out["notes"].append(
                "structured outputs did not come back as valid JSON — the provider "
                "probably dropped output_config. Every agent here parses JSON, so "
                "expect failures until that is handled."
            )
    except Exception as err:
        out["notes"].append(f"basic call failed: {type(err).__name__}: {err}")
        return out

    # 2. The server-side web search tool — what qualifier(research=True) needs.
    try:
        r = api.messages.create(
            model=model, max_tokens=512,
            messages=[{"role": "user", "content": "Search the web for anthropic.com and name the company."}],
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 1}],
        )
        out["web_search"] = any(
            getattr(b, "type", "") == "web_search_tool_result" and isinstance(getattr(b, "content", None), list)
            for b in r.content
        )
        if not out["web_search"]:
            out["notes"].append(
                "web_search returned no results — run the qualifier without "
                "--research; it will still score fit, but it cannot read a "
                "company's site for something to open on."
            )
    except Exception as err:
        out["notes"].append(f"web_search unsupported here ({type(err).__name__}); use --research off.")

    return out
