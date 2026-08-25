// Proves the bug that was live in `linkedfinderapiaccess`, and that the patch fixes it.
// Reproduces ONLY the fast-path body-handling block, in both forms.

const upstream = { status: 403, text: async () => '{"error":"upstream refused"}' };

async function OLD(response) {
  try {
    let data;
    try {
      const text = await response.text();          // <-- block-scoped
      if (!text || text.trim() === '') return { status: 502 };
      data = JSON.parse(text);
    } catch (e) { return { status: 502 }; }

    if (response.status === 403 || response.status === 401) {
      void text.slice(0, 500);                     // <-- out of scope
    }
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, error: error.message };  // the outer catch in the worker
  }
}

async function NEW(response) {
  try {
    let text = '';
    try { text = await response.text(); } catch (e) { return { status: 502 }; }
    if (response.status === 403 || response.status === 401) void text.slice(0, 500);
    if (!text || text.trim() === '') return { status: 502 };
    let data;
    try { data = JSON.parse(text); } catch (e) { return { status: 502 }; }
    return { status: response.status, data };
  } catch (error) {
    return { status: 500, error: error.message };
  }
}

const before = await OLD(upstream);
const after  = await NEW(upstream);
console.log('upstream said 403');
console.log('  OLD worker returns:', JSON.stringify(before));
console.log('  NEW worker returns:', JSON.stringify(after));
console.log(before.status === 500 && after.status === 403
  ? '\nPASS — bug reproduced on old code, gone on new code.'
  : '\nFAIL — did not reproduce as expected.');
process.exit(before.status === 500 && after.status === 403 ? 0 : 1);
