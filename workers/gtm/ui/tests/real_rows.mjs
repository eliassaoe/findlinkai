// The first real /search/companies response, reduced to the fields the nodes
// read. 25 rows, total 1,143,676. Kept here because it is the only ground
// truth this flow has ever had for the company shape.
export const META = { total: 1143676, results_count: 25, credits_charged: 0, remaining_balance: 2499 };
const crit = (a, b, c) => ({
  'Vente B2B active': { score: a, reasoning: 'x' },
  'Equipe commerciale de moins de 5': { score: b, reasoning: 'not mentioned' },
  'is NOT: Formation purement subventionnee': { score: c, reasoning: 'x' },
});
export const COMPANIES = [
  { domain:'microsoft.com', name:'ESIC - Centre de formation', geo:'FR', size:35, linkedin_id:11105262, revenue_annual:305453000000, hiring:false,
    employees_by_department:{ employees_count_sales:3 }, description:'Paris-based online training center', criteria: crit(1,1,3) },
  { domain:'kemnaker.go.id', name:'BBPVP Bekasi', geo:'ID', size:55, linkedin_id:105071246, revenue_annual:null, hiring:false, criteria: crit(3,1,4) },
  { domain:'pearson.com', name:'IndiaCan', geo:'IN', size:600, linkedin_id:680563, revenue_annual:3552000000, hiring:false, criteria: crit(3,1,4) },
  { domain:'cityandguilds.com', name:'City & Guilds', geo:'GB', size:3000, linkedin_id:163067, revenue_annual:280000000, hiring:false, criteria: crit(1,1,3) },
  { domain:'mcdonalds.com', name:'Hamburger University', geo:'US', size:5, linkedin_id:57981547, revenue_annual:26885000000, hiring:false, criteria: crit(3,1,3) },
  { domain:'nyp.edu.sg', name:'Nanyang Polytechnic', geo:'SG', size:350, linkedin_id:16273, hiring:true, criteria: crit(1,1,3) },
  { domain:'wbstraining.de', name:'WBS TRAINING', geo:'DE', size:225, linkedin_id:106643960, hiring:true, employees_by_department:{ employees_count_sales:4 }, criteria: crit(1,1,3) },
  { domain:'ccoo.es', name:'FOREM PV', geo:'ES', size:130, linkedin_id:2650409, revenue_annual:178973, hiring:false, criteria: crit(2,1,3) },
  { domain:'ac-normandie.fr', name:'Greta Côtes Normandes - Antennes du Calvados', geo:'FR', size:175, linkedin_id:69242996, revenue_annual:null, hiring:false,
    employees_by_department:{ employees_count_education:25 }, description:'Normandy-based vocational training center', criteria: crit(1,1,3) },
  { domain:'ecf.asso.fr', name:'ECF PRO', geo:'FR', size:4500, linkedin_id:10508439, revenue_annual:null, hiring:false, employees_by_department:{ employees_count_sales:8 }, criteria: crit(3,1,3) },
  { domain:'theknowledgeacademy.com', name:'The Knowledge Academy', geo:'GB', size:35, linkedin_id:333496, revenue_annual:40000000, hiring:false, employees_by_department:{ employees_count_sales:474 }, criteria: crit(4,1,3) },
  { domain:'tafesa.edu.au', name:'TAFE SA', geo:'AU', size:2000, linkedin_id:759821, hiring:true, criteria: crit(1,1,3) },
];
export const RESPONSE = { success: true, companies: COMPANIES, meta: META };
