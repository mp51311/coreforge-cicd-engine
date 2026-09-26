// Widerspruchs-Kategorien Spec <-> Plattform (Punkt I). Gemeinsam genutzt von i0_analyze.js und test_po_facts_isolated.js.
// P* = durch PLATFORM_FACTS abgedeckt, X* = Plattform-Grenze, die nur im PO-Teil steht.
const CATS = [
  // --- abgedeckt durch PLATFORM_FACTS (Format_Dev_Payload) ---
  { id: 'P1_cors', fact: 1, re: /\bcors\b|cross[- ]origin|access-control-allow|CORSMiddleware/i },
  { id: 'P2_html_serving', fact: 2, re: /StaticFiles|app\.mount|\bmount(ed)?\b.*static|\/static\b|jinja|TemplateResponse|HTMLResponse|static (mount|directory|dir)\b|embed(ded)?\s+(the\s+|a\s+)?(single\s+)?html|inline html|html string/i },
  { id: 'P3_abs_url', fact: 3, re: /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)|\bbase[_ ]?url\b|API_BASE|localhost:\d+/i },
  { id: 'P3_mock', fact: 3, re: /\bmock(ed|s|ing)?\b|\bfake\b|\bdummy\b|simulat(e|ed|ion) (the )?(api|backend|response|data)|fallback (data|values|response)|offline mode|client[- ]side (generat|comput|calculat)/i },
  { id: 'P4_innerhtml', fact: 4, re: /innerHTML|insertAdjacentHTML|render(ed|s)? (as )?(raw )?html|markdown render/i },
  { id: 'P5_polling', fact: 5, re: /\bpoll(ing|s|ed)?\b|setInterval|auto[- ]?refresh|refresh(es|ed)? (every|each|automatically)|live[- ]updat|every \d+\s*(ms|s|sec|seconds|second)\b|real[- ]?time/i },
  { id: 'P6_sync', fact: 6, re: /\bsync(hronous)? (def|handler|route|endpoint)/i },
  { id: 'P7_host_port', fact: 7, re: /uvicorn\.run|--port|\bport\s*[:=]?\s*(?!8000)\d{2,5}\b|:(?!8000)\d{4,5}\b|\bPORT\b env|host\s*[:=]?\s*['"]?127\.0\.0\.1/i },
  // --- NICHT in PLATFORM_FACTS, aber durch Build_Command_Builder/Prepare_Disk_Files/Dev-Prompts festgelegt ---
  { id: 'X1_extra_files', re: /\bapp\.js\b|\bscript\.js\b|\bstyles?\.css\b|templates\/|static\/|database\.py|models\.py|schemas\.py|config\.py|Dockerfile|docker-compose|package\.json|\bseparate (js|css|file)/i },
  { id: 'X2_env_secrets', re: /environment variable|\benv(ironment)? var|os\.getenv|os\.environ|\.env\b|api[_ ]?key|secret[_ ]?key|access token|bearer token|\bpassword\b/i },
  { id: 'X3_external_service', re: /postgres|mysql|mariadb|redis|mongo|celery|rabbitmq|kafka|elasticsearch|\bsmtp\b|send(s|ing)? (an )?e-?mail|sendgrid|twilio|\bs3\b/i },
  { id: 'X4_persistence', re: /sqlite|\.db\b|persist(ent|ence|ed)?|survive(s)? restart|database file|volume/i },
  { id: 'X5_frontend_toolchain', re: /\breact\b|\bvue\b|angular|svelte|\bnpm\b|node\.js|webpack|\bvite\b|typescript|tailwind\.config|postcss|tailwind cli|build step/i },
  { id: 'X6_https_proxy', re: /\bhttps\b(?!:\/\/cdn)|\btls\b|\bssl\b|certificate|nginx|reverse proxy|\bdomain\b|oauth|\bhsts\b/i },
  { id: 'X7_realtime_bg', re: /websocket|socket\.io|server-sent|\bsse\b|\bcron\b|scheduler|apscheduler|background (task|job|worker)|gunicorn|\bworkers\b/i },
  { id: 'X8_outbound', re: /openweather|external api|third[- ]party api|public api|fetch(es|ing)? (data )?from (an )?external|requests\.get|httpx/i },
  { id: 'X9_auth_rate', re: /rate[- ]?limit|slowapi|authenticat|login|jwt|session cookie|csrf/i },
];
// Punkt I: Kategorien, die in einer Spec nie vorkommen dürfen (Handprüfung jeder Fundstelle), und Nicht-Plattform-Optionen in PO-Antworten
const STRICT_CATS = ['P1_cors', 'P2_html_serving', 'P3_abs_url', 'P3_mock', 'P7_host_port', 'X1_extra_files', 'X2_env_secrets', 'X3_external_service', 'X5_frontend_toolchain', 'X6_https_proxy'];
const NON_PLATFORM_RE = /node\.?js|\bexpress\b|\breact\b|\bvue\b|\bvite\b|docker-compose|compose\.ya?ml/i;
module.exports = { CATS, STRICT_CATS, NON_PLATFORM_RE };
