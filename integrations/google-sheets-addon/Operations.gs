/**
 * GENERATED from integrations/catalog/operations.json. Do not edit by hand.
 * Spec version 1.1.0 — 20 lookups.
 *
 * Regenerate with: node build.mjs
 */

var LINKFINDER_API_BASE = "https://api.linkfinderai.com";

var LINKFINDER_OPERATIONS = [
  {
    "type": "lead_full_name_to_linkedin_url",
    "label": "Find LinkedIn URL from Name",
    "category": "People",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Full Name and Company",
    "inputHelp": "The person's full name and their company, in one string.",
    "example": "Bill Gates Microsoft",
    "outputField": "linkedin_url",
    "outputKind": "scalar",
    "compositeInput": {
      "parts": [
        {
          "name": "name",
          "label": "Full Name",
          "required": true,
          "help": "The person's full name. \"Doe, John\" is flipped to \"John Doe\" automatically.",
          "example": "Bill Gates"
        },
        {
          "name": "company",
          "label": "Company",
          "required": false,
          "help": "Where they work. Much the strongest signal after the name.",
          "example": "Microsoft"
        },
        {
          "name": "location",
          "label": "Location",
          "required": false,
          "help": "City, region or country. Separates people who share a name.",
          "example": "Seattle"
        },
        {
          "name": "job_title",
          "label": "Job Title",
          "required": false,
          "help": "Their role. Helps when a company has several people with the same name.",
          "example": "Co-chair"
        }
      ],
      "joinWith": " ",
      "note": "Joined with single spaces, empty parts dropped — the same string app.html builds."
    },
    "params": []
  },
  {
    "type": "email_to_linkedin_url",
    "label": "Find LinkedIn URL from Email",
    "category": "People",
    "credits": 5,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Email Address",
    "inputHelp": "A professional email address.",
    "example": "john.doe@company.com",
    "outputField": "linkedin_url",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "lead_full_name_to_email",
    "label": "Find Email from Name",
    "category": "People",
    "credits": 7,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Full Name and Company",
    "inputHelp": "The person's full name and their company, in one string.",
    "example": "Bill Gates Microsoft",
    "outputField": "email",
    "outputKind": "scalar",
    "compositeInput": {
      "parts": [
        {
          "name": "name",
          "label": "Full Name",
          "required": true,
          "help": "The person's full name. \"Doe, John\" is flipped to \"John Doe\" automatically.",
          "example": "Bill Gates"
        },
        {
          "name": "company",
          "label": "Company",
          "required": false,
          "help": "Where they work. Much the strongest signal after the name.",
          "example": "Microsoft"
        },
        {
          "name": "location",
          "label": "Location",
          "required": false,
          "help": "City, region or country. Separates people who share a name.",
          "example": "Seattle"
        },
        {
          "name": "job_title",
          "label": "Job Title",
          "required": false,
          "help": "Their role. Helps when a company has several people with the same name.",
          "example": "Co-chair"
        }
      ],
      "joinWith": " ",
      "note": "Joined with single spaces, empty parts dropped — the same string app.html builds."
    },
    "params": []
  },
  {
    "type": "linkedin_profile_to_email",
    "label": "Find Email from LinkedIn Profile",
    "category": "People",
    "credits": 10,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "LinkedIn Profile URL",
    "inputHelp": "A LinkedIn person profile URL.",
    "example": "https://www.linkedin.com/in/someone",
    "outputField": "email",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "linkedin_profile_to_linkedin_info",
    "label": "Get LinkedIn Profile Details",
    "category": "People",
    "credits": 10,
    "perEmployeeBilling": false,
    "alwaysAsync": true,
    "altType": null,
    "inputLabel": "LinkedIn Profile URL",
    "inputHelp": "A LinkedIn person profile URL.",
    "example": "https://www.linkedin.com/in/someone",
    "outputField": null,
    "outputKind": "object",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "linkedin_profile_to_phone",
    "label": "Find Phone from LinkedIn Profile",
    "category": "People",
    "credits": 50,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "LinkedIn Profile URL",
    "inputHelp": "A LinkedIn person profile URL.",
    "example": "https://www.linkedin.com/in/someone",
    "outputField": "phone",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "company_name_to_email",
    "label": "Find Company Email",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Company Name",
    "inputHelp": "The company's name.",
    "example": "Tesla",
    "outputField": "email",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "company_name_to_employee_count",
    "label": "Find Company Employee Count",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Company Name",
    "inputHelp": "The company's name.",
    "example": "Tesla",
    "outputField": "employee_count",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "company_name_to_linkedin_url",
    "label": "Find Company LinkedIn URL",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Company Name",
    "inputHelp": "The company's name.",
    "example": "Tesla",
    "outputField": "linkedin_url",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "company_name_to_phone",
    "label": "Find Company Phone",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Company Name",
    "inputHelp": "The company's name.",
    "example": "Tesla",
    "outputField": "phone",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "company_name_to_website",
    "label": "Find Company Website",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Company Name",
    "inputHelp": "The company's name.",
    "example": "Tesla",
    "outputField": "website",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "linkedin_company_to_employee_count",
    "label": "Get Employee Count from LinkedIn Company",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "LinkedIn Company Page URL",
    "inputHelp": "A LinkedIn company page URL.",
    "example": "https://www.linkedin.com/company/tesla-motors",
    "outputField": "employee_count",
    "outputKind": "scalar",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "company_domain_to_employees",
    "label": "List Employees by Company Domain",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": true,
    "alwaysAsync": true,
    "altType": null,
    "inputLabel": "Company Domain",
    "inputHelp": "The company's domain, not its name — tesla.com, not Tesla.",
    "example": "tesla.com",
    "outputField": null,
    "outputKind": "list",
    "compositeInput": null,
    "params": [
      {
        "name": "department",
        "label": "Department",
        "type": "string",
        "help": "Only return employees in this department, e.g. Engineering."
      },
      {
        "name": "seniority",
        "label": "Seniority",
        "type": "string",
        "help": "Only return employees at this seniority, e.g. Director."
      },
      {
        "name": "employee_count",
        "label": "Max Employees",
        "type": "integer",
        "help": "Cap how many employees come back. Billed 0.5 credits each."
      }
    ]
  },
  {
    "type": "company_name_to_employees",
    "label": "List Employees by Company Name",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": true,
    "alwaysAsync": true,
    "altType": null,
    "inputLabel": "Company Name",
    "inputHelp": "The company's name.",
    "example": "Tesla",
    "outputField": null,
    "outputKind": "list",
    "compositeInput": null,
    "params": [
      {
        "name": "department",
        "label": "Department",
        "type": "string",
        "help": "Only return employees in this department, e.g. Engineering."
      },
      {
        "name": "seniority",
        "label": "Seniority",
        "type": "string",
        "help": "Only return employees at this seniority, e.g. Director."
      },
      {
        "name": "employee_count",
        "label": "Max Employees",
        "type": "integer",
        "help": "Cap how many employees come back. Billed 0.5 credits each."
      }
    ]
  },
  {
    "type": "linkedin_company_to_employees",
    "label": "List Employees from LinkedIn Company",
    "category": "Companies",
    "credits": 1,
    "perEmployeeBilling": true,
    "alwaysAsync": true,
    "altType": null,
    "inputLabel": "LinkedIn Company Page URL",
    "inputHelp": "A LinkedIn company page URL.",
    "example": "https://www.linkedin.com/company/tesla-motors",
    "outputField": null,
    "outputKind": "list",
    "compositeInput": null,
    "params": [
      {
        "name": "department",
        "label": "Department",
        "type": "string",
        "help": "Only return employees in this department, e.g. Engineering."
      },
      {
        "name": "seniority",
        "label": "Seniority",
        "type": "string",
        "help": "Only return employees at this seniority, e.g. Director."
      },
      {
        "name": "employee_count",
        "label": "Max Employees",
        "type": "integer",
        "help": "Cap how many employees come back. Billed 0.5 credits each."
      }
    ]
  },
  {
    "type": "linkedin_company_to_linkedin_info",
    "label": "Get LinkedIn Company Details",
    "category": "Companies",
    "credits": 6,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "LinkedIn Company Page URL",
    "inputHelp": "A LinkedIn company page URL.",
    "example": "https://www.linkedin.com/company/tesla-motors",
    "outputField": null,
    "outputKind": "object",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "linkedin_post_to_reactions",
    "label": "Get LinkedIn Post Reactions",
    "category": "Social",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "LinkedIn Post URL",
    "inputHelp": "A LinkedIn post URL.",
    "example": "https://www.linkedin.com/posts/someone_activity-123",
    "outputField": null,
    "outputKind": "list",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "instagram_lookup",
    "label": "Look Up an Instagram Profile",
    "category": "Social",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": "instagram_profile_to_instagram_info",
    "inputLabel": "Instagram Handle or URL",
    "inputHelp": "An Instagram handle or profile URL.",
    "example": "@nasa",
    "outputField": null,
    "outputKind": "object",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "b2b_data_lookup",
    "label": "B2B Data Lookup (Any Input)",
    "category": "Discovery",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": false,
    "altType": null,
    "inputLabel": "Company or Person Identifier",
    "inputHelp": "Use this only when you do not know the input type. A specific operation is more reliable.",
    "example": "tesla.com",
    "outputField": null,
    "outputKind": "object",
    "compositeInput": null,
    "params": []
  },
  {
    "type": "leads_finder_ai",
    "label": "Find Leads with AI",
    "category": "Discovery",
    "credits": 1,
    "perEmployeeBilling": false,
    "alwaysAsync": true,
    "altType": null,
    "inputLabel": "Describe the Leads You Want",
    "inputHelp": "Plain English — job titles, industry, company size, location.",
    "example": "VP Sales at B2B SaaS startups in the United States",
    "outputField": null,
    "outputKind": "list",
    "compositeInput": null,
    "params": [
      {
        "name": "fetch_count",
        "label": "Number of Leads",
        "type": "integer",
        "help": "How many leads to return."
      }
    ]
  }
];

/** One lookup, by its API type. */
function lfOperation(type) {
  for (var i = 0; i < LINKFINDER_OPERATIONS.length; i++) {
    if (LINKFINDER_OPERATIONS[i].type === type) return LINKFINDER_OPERATIONS[i];
  }
  return null;
}

/** The lookups, for the sidebar dropdown. */
function getOperations() {
  return LINKFINDER_OPERATIONS;
}
