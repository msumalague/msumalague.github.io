/**
 * Project data for the portfolio.
 *
 * To add a project, append an object to PORTFOLIO_PROJECTS. Fields:
 *   id          unique slug (used for the dialog URL hash)
 *   title       project name
 *   tagline     one line, shown under the title
 *   context     short provenance line, e.g. "Personal project · 2022"
 *   categories  any of: ml, genai, cv, robotics, data, software (drive the filters)
 *   theme       card visual treatment: agent | vision | neural | robotics | data | product
 *   featured    true to render as a wide card
 *   summary     2-3 sentences for the card
 *   problem     why the project matters (dialog)
 *   built       list of contributions (dialog); keep to what can be verified
 *   stack       technologies (featured cards show the first 6, other cards the first 4; the dialog shows all)
 *   image       { base, alt, position } -> images/projects/<base>-card-{640,1120}.{webp,jpg}
 *               or { svg, alt } for a single SVG illustration
 *   gallery     [{ src, alt, caption }] full-size images for the dialog (src has no extension;
 *               <src>.webp and <src>.jpg must both exist), or [{ svg, alt, caption }]
 *   links       [{ label, url, type: github | doc | demo }]; omit when the source is not public
 *   privateNote shown instead of a source link when there is no public repository
 *   note        optional caveat shown in the dialog
 */
window.PORTFOLIO_PROJECTS = [
  {
    id: "geo-studio",
    title: "GEO Studio",
    tagline: "GenAI content-intelligence platform: sales calls in, grounded and PII-safe content out",
    context: "Client work · 2026 · Primary engineer",
    categories: ["genai", "ml", "data", "software"],
    theme: "agent",
    featured: true,
    summary:
      "A production GenAI platform for a B2B SaaS client. It turns sales-call transcripts into grounded content opportunities, briefs, and drafts that are checked for evidence, unsupported claims, duplication, and personal data, and it tracks how search engines and AI assistants represent the brand.",
    problem:
      "The marketing team had a large backlog of sales-call transcripts full of real customer questions, but no safe, repeatable way to turn them into on-brand content without leaking customer details, duplicating existing pages, or making unsupported product claims. They also had no view of how search engines and AI answer engines described the product.",
    built: [
      "Primary engineer from the first commit, and the sole developer for the first three months; a teammate joined for later phases.",
      "Async FastAPI service plus a queue worker with Postgres SKIP LOCKED claims, lease recovery, and advisory-locked scheduled jobs.",
      "Transcript pipeline: parsing, PII redaction, an LLM sensitivity classifier, insight extraction, sentence-aware chunking, and embeddings in pgvector.",
      "Retrieval-augmented opportunity discovery with a side-effect-free decision gate that blocks, reframes, or surfaces each topic based on evidence, claim risk, and duplication.",
      "Provider-routed LLM layer: Claude through AWS Bedrock and the Anthropic API with a runtime model picker and streamed drafts, Gemini embeddings, and deterministic offline mocks for tests.",
      "Generators for each content type, with post-generation QA and a claim audit against a product knowledge base.",
      "Search and AI-visibility layer: a Search Console opportunity radar, budgeted and PII-scrubbed vendor snapshots, and versioned benchmark panels across ChatGPT, Claude, Gemini, and Perplexity.",
      "React + TypeScript workspace on an OpenAPI-generated client, Sentry and Prometheus observability, staging and production deploys, and a hermetic backend suite of 2,600+ tests.",
      "AI-assisted engineering workflow: a CLAUDE.md operating manual and custom Claude Code skills for verification and QA reports.",
    ],
    stack: ["Claude (Bedrock + API)", "RAG · pgvector", "FastAPI", "PostgreSQL", "React", "TypeScript", "Gemini embeddings", "AWS", "Playwright", "pytest", "Sentry", "Claude Code"],
    image: { svg: "images/projects/geo-studio.svg", alt: "Illustration: sales-call transcripts pass through PII redaction into an embedding space, then a decision gate, producing a grounded draft with QA, plus AI answer-engine visibility panels" },
    gallery: [
      { svg: "images/projects/geo-studio.svg", alt: "Illustration of the GEO Studio pipeline from transcripts to grounded drafts", caption: "Original illustration. The product's interface and the client's data are confidential." },
    ],
    privateNote: "Client work, private repository",
  },
  {
    id: "parcel-agent",
    title: "Listing-to-Parcel Vision Agent",
    tagline: "Geospatial search plus a vision LLM to match public listings to public parcel records",
    context: "Client work · 2026",
    categories: ["genai", "cv", "data"],
    theme: "agent",
    summary:
      "A weekly research agent for a property-management client. It narrows each public rental listing's approximate location to a shortlist of county parcels, then has a vision LLM compare pools, rooflines, and lot shape against aerial imagery. A match is auto-confirmed only when the model is confident and two independent signals agree.",
    problem:
      "Rental platforms show only an approximate location, so identifying which property a listing refers to meant slow manual research for every listing.",
    built: [
      "Sole engineer on the project.",
      "Config-driven intake normalised to one schema, buy-box filters, and a weighted priority score that records missing inputs as data gaps instead of guessing.",
      "Parcel narrowing with county ArcGIS REST radius queries, haversine ranking, and polygon-centroid geometry.",
      "A multimodal prompt that pairs listing photos with labelled aerial tiles and returns strict JSON.",
      "Confidence gate: a match is confirmed only above a configured threshold with two or more independent visual signals; everything else goes to a human review queue.",
      "Swappable vision provider (Claude Haiku or Gemini) with a test-enforced model pin, retries with backoff, and per-call cost logging against a monthly cap.",
      "Weekly orchestration with deduplication, spreadsheet and CRM outputs, crash and hang alerting, and a guard test that fails the build if any automated outreach code appears. 187 tests in total.",
    ],
    stack: ["Claude API (vision)", "Gemini", "ArcGIS REST", "Python", "SQLite", "pytest", "Google Sheets API"],
    image: { svg: "images/projects/parcel-agent.svg", alt: "Illustration: an approximate map pin narrows to labelled parcels A to E, a listing photo is compared with an aerial tile on pool, roofline, and lot shape, then a confidence gate decides between a confirmed match and human review" },
    gallery: [
      { svg: "images/projects/parcel-agent.svg", alt: "Illustration of the listing-to-parcel matching pipeline", caption: "Original illustration. Listings, parcels, and client data are not shown." },
    ],
    privateNote: "Client work, private repository",
  },
  {
    id: "dental-tryon",
    title: "Dental Ornament Virtual Try-On",
    tagline: "Computer vision places a tooth gem; generative AI makes it look real",
    context: "Client prototype · 2025",
    categories: ["genai", "cv"],
    theme: "vision",
    summary:
      "An interactive try-on app that detects the teeth in a smile photo, places a chosen ornament on a selected tooth, and uses generative image editing to make it look realistic. It compares prompt-only generation with a detection-guided composite plus an enhancement step, using switchable Gemini and OpenAI image models.",
    problem:
      "Prompt-only image models put small objects in the wrong place and at the wrong scale, while classic compositing gets placement right but looks flat. The goal was correct placement and realism together.",
    built: [
      "Prototyped prompt-only placement with Gemini 2.5 Flash Image, including ornament pre-processing (alpha trim, edge feathering, size capping) and tightly constrained prompts.",
      "Evaluated a Vertex AI virtual try-on model as an alternative approach.",
      "Built a Streamlit app that connects MediaPipe mouth landmarks and an ONNX tooth detector to interactive tooth and ornament selection.",
      "Added rotation-aware compositing that chooses between Laplacian-pyramid blending and OpenCV seamless cloning.",
      "Added a size-preserving enhancement step with switchable Gemini and OpenAI gpt-image-1 image-edit backends.",
      "Containerised the app with Docker.",
    ],
    stack: ["Gemini image API", "OpenAI gpt-image-1", "MediaPipe", "ONNX Runtime", "OpenCV", "Streamlit", "Vertex AI", "Docker"],
    image: { svg: "images/projects/dental-tryon.svg", alt: "Illustration: a row of numbered teeth with a gem placed on tooth three, a face-mesh lattice and roll angle above, and a detect, composite, enhance pipeline" },
    gallery: [
      { svg: "images/projects/dental-tryon.svg", alt: "Illustration of the try-on pipeline", caption: "Original illustration. No real photos are shown." },
    ],
    privateNote: "Client prototype, private repository",
  },
  {
    id: "feedback-triage",
    title: "Customer Feedback Triage: LLM vs. ML",
    tagline: "Schema-constrained LLM classification benchmarked against a TF-IDF baseline",
    context: "Client demo · 2026",
    categories: ["genai", "ml"],
    theme: "neural",
    summary:
      "An analytics app for a health-and-wellness retail client that labels free-text customer feedback by category, urgency, and sentiment. A schema-constrained LLM classifier runs side by side with a classical ML baseline, both are scored on precision and recall, and the app generates summaries by region and store.",
    problem:
      "Store feedback arrived as unstructured text. The team needed consistent triage labels, a way to spot urgent items, and a view of which locations needed attention.",
    built: [
      "Few-shot Gemini classifier with explicit label definitions, tie-break rules, JSON-schema output, temperature 0, and confidence normalisation.",
      "Classical baseline: word and character n-gram TF-IDF with class-balanced logistic regression, one head each for category, priority, and sentiment.",
      "Evaluation panel with per-class and macro precision and recall on a stratified hold-out split.",
      "Weak-supervision path: the ML baseline can train on LLM-generated labels when no gold labels exist.",
      "Robust CSV ingestion (encoding detection, column-name heuristics), a filterable dashboard, and LLM-generated summaries, risks, and quick wins.",
      "Login gate and Docker image for deployment.",
    ],
    stack: ["Gemini API", "scikit-learn", "Streamlit", "pandas", "Altair", "Docker"],
    image: { svg: "images/projects/feedback-triage.svg", alt: "Illustration: feedback bubbles flow into an LLM classifier lane and a TF-IDF baseline lane, then into five category bins with priority flags, with an evaluation panel below" },
    gallery: [
      { svg: "images/projects/feedback-triage.svg", alt: "Illustration of the LLM and ML triage lanes", caption: "Original illustration. Customer feedback is client data and is not shown." },
    ],
    privateNote: "Client demo, private repository",
  },
  {
    id: "crypto-regime",
    title: "Crypto Regime Forecasting & Autonomous Trading",
    tagline: "Multi-horizon ML early-warning scores, turned into risk-guarded trades",
    context: "Client models + internal R&D · 2026",
    categories: ["ml", "data", "software"],
    theme: "neural",
    featured: true,
    summary:
      "A daily ML pipeline that turns public market, sentiment, and derivatives data into 0–100 upturn and downturn scores across nine forecast horizons, plus an internal trading system that acts on those scores unattended, behind layered risk controls.",
    problem:
      "A crypto investment client needed an early, explainable warning of altcoin drawdowns and rallies, delivered as a simple daily signal. Acting on model scores safely takes more than the scores: it needs guards against bad signals, partial fills, whipsaws, and runaway orders.",
    built: [
      "Built the forecasting pipeline (with a collaborator on the earliest version) and was the sole engineer on the trading system.",
      "Ingestion from market-data, sentiment, volatility, and derivatives APIs into a custom market-cap-weighted altcoin index, with tiered drawdown and upturn event labels.",
      "Lagged technical and cross-asset features, and a per-horizon model zoo (ExtraTrees, Random Forest, logistic regression, HistGB, XGBoost, LightGBM) evaluated with walk-forward out-of-fold validation.",
      "Weighted-voting and logistic-stacking ensembles, with thresholds chosen for maximum recall under precision and alert-rate limits.",
      "Model overhaul for trading: forward path labels, purged walk-forward CV with an embargo, per-horizon Platt calibration, and gating of degenerate horizons.",
      "Trading layer: an HMAC-signed exchange client, a signal-to-strategy engine with multi-day confirmation against whipsaw, per-coin and per-order caps, a daily-loss halt, a drawdown kill switch, and a hard live-trading switch.",
      "Docker and cron deployment on a cloud VM, Slack alerts, a spreadsheet audit trail, and pytest edge-case tests, built with Claude Code as an AI pair-programmer.",
    ],
    stack: ["XGBoost", "LightGBM", "scikit-learn", "pandas", "Docker", "Slack API", "Google Sheets API", "pytest", "Claude Code"],
    image: { svg: "images/projects/crypto-regime.svg", alt: "Illustration: data sources feed an altcoin index with event windows, a six-model zoo merges into an ensemble that drives upturn and downturn gauges, and a trading layer passes signals through strategy and risk guards to the exchange" },
    gallery: [
      { svg: "images/projects/crypto-regime.svg", alt: "Illustration of the forecasting and trading system", caption: "Original illustration with placeholder values. Client data and trading results are not shown." },
    ],
    privateNote: "Client + internal work, private repositories",
  },
  {
    id: "analytics-explorers",
    title: "Benchmark & Segment Analytics Explorers",
    tagline: "Data analysis and benchmarking, delivered as secure self-serve apps",
    context: "Client work · 2026",
    categories: ["data", "software"],
    theme: "data",
    summary:
      "Two secure web apps that let analysts and client leadership explore confidential analyses themselves. One slices a large SaaS product benchmark into percentile bands with one-click exports. The other turns a customer-segment review into an auditable explorer where every figure carries its own provenance.",
    problem:
      "Every new cut of a benchmark had to be built by hand, and a segment review delivered as a spreadsheet had figures that were hard to trace. The data was confidential, so it needed real server-side access control rather than a login screen that only hid it in the browser.",
    built: [
      "Sole author of both apps.",
      "Benchmark explorer: React and Recharts views (dumbbell, heatmap, trend, projection) on a versioned dataset built in Python from Parquet cohorts.",
      "Statistics library with direction-aware P50/P75/P90 bands, small-group suppression, and binary-search percentile ranking (233 ms down to 5 ms on a heavy cut).",
      "Exports to SVG/PNG, multi-sheet Excel with an audit sheet, and Google Sheets via OAuth with the narrowest Drive scope.",
      "Zero-dependency Node auth server: scrypt hashing, HMAC-signed cookies, server-side revocation, brute-force throttling, and a CSP. Fixed the defects an adversarial security review found.",
      "Segment explorer: FastAPI + React, with one metrics module where every number carries its source, rule, and a match-to-published flag, plus a regression suite that re-derives the report's headline figures and Playwright browser tests.",
      "Containerised, health-checked deployments on a managed cloud platform.",
    ],
    stack: ["React", "FastAPI", "Node.js", "pandas", "Recharts", "Parquet", "Playwright", "Docker"],
    image: { svg: "images/projects/analytics-explorers.svg", alt: "Illustration: data files feed a metrics core, pass a server-side session lock, and appear in a browser explorer with percentile bands for generic groups and export buttons" },
    gallery: [
      { svg: "images/projects/analytics-explorers.svg", alt: "Illustration of the analytics explorers", caption: "Original illustration with placeholder values. Client data is never shown." },
    ],
    privateNote: "Client work, private repositories",
  },
  {
    id: "revenue-workbook",
    title: "Revenue Analytics Workbook Generator",
    tagline: "Upload a revenue cube, get a fully formula-driven analysis workbook",
    context: "Client work · 2025",
    categories: ["data", "genai", "software"],
    theme: "data",
    summary:
      "A Streamlit tool that turns customer-by-period revenue and profit data into a multi-tab Excel workbook of cohort, retention, top-customer, and revenue-bridge analyses. Every output cell is a live Excel formula, so analysts can audit and extend the numbers, and an LLM detects the input schema with a rules-based fallback.",
    problem:
      "Analysts were rebuilding the same customer revenue analyses by hand for each dataset, with hard-coded values that were slow to produce and hard to audit.",
    built: [
      "Sole author.",
      "LLM column detection (customer, industry, period) returning strict JSON, with a regex and keyword fallback.",
      "Period parser handling annual, year-to-date, and last-twelve-month columns, with fractional-year CAGR.",
      "xlsxwriter generators that emit live formulas (SUMIFS, SUMPRODUCT, COUNTIFS, RRI, array formulas, named ranges, sparklines).",
      "Revenue bridge, customer waterfall, cohort, like-for-like, top movers, and margin corkscrew sheets.",
      "Streamlit upload-and-download app with a login gate, packaged with Docker.",
    ],
    stack: ["Python", "pandas", "xlsxwriter", "Gemini API", "Streamlit", "Docker"],
    image: { svg: "images/projects/revenue-workbook.svg", alt: "Illustration: a data cube labelled customer, segment, and period is read by an LLM lens and becomes a workbook with a revenue bridge chart, formula cells, and analysis tabs" },
    gallery: [
      { svg: "images/projects/revenue-workbook.svg", alt: "Illustration of the revenue workbook generator", caption: "Original illustration with placeholder values. Client financials are never shown." },
    ],
    privateNote: "Client work, private repository",
  },
  {
    id: "property-ops",
    title: "Property Operations Platform",
    tagline: "Onboarding tracker and scheduled integrations for a vacation-rental operator",
    context: "Client work · 2025–2026",
    categories: ["software", "data"],
    theme: "product",
    summary:
      "A production onboarding web app and a suite of scheduled integrations for a vacation-rental operator. The app runs a five-phase onboarding checklist with notifications, templated owner emails, and work-board sync. The jobs keep reservations, reviews, maintenance reports, and digests flowing between systems without copy-paste.",
    problem:
      "Onboarding a property meant many tasks spread across several people and tracked in scattered spreadsheets. Staff also copied reservations, reviews, and tickets between systems by hand and assembled owner reports manually every month.",
    built: [
      "Sole author of both the app and the automation suite.",
      "Layered Flask app (web, services, repositories, integrations) with a framework-free domain model, HTMX partial updates, and a token-based design system with dark mode.",
      "Hardened auth and request security: allow-listed sign-in, scrypt hashing, signed cookies, same-origin checks, and a nonce-based CSP.",
      "Fault-tolerant integrations (work-management GraphQL, Slack, SMTP) and per-property PDF auto-fill attached to owner emails.",
      "CI with linting, security lint rules, and SQL tests against a disposable Postgres; WCAG contrast tests and a Playwright sweep of every page across 7 viewports and both themes; about 250 tests.",
      "Scheduled jobs: reservation and review sync into GraphQL boards, rating-trend snapshots, monthly maintenance PDFs filed to Google Drive, weekly occupancy workbooks, Gmail digests, and hash-based deploy-drift detection.",
    ],
    stack: ["Flask", "HTMX", "PostgreSQL", "GitHub Actions", "Playwright", "Docker", "GraphQL", "Gmail API", "n8n"],
    image: { svg: "images/projects/property-ops.svg", alt: "Illustration: a five-phase onboarding board with a progress ring beside a scheduler hub connected to boards, PDF reports, digests, workbooks, drive, and reviews" },
    gallery: [
      { svg: "images/projects/property-ops.svg", alt: "Illustration of the onboarding tracker and integrations", caption: "Original illustration. The client's interface and data are not shown." },
    ],
    privateNote: "Client work, private repositories",
  },
  {
    id: "drone-detection",
    title: "Drone Detection System",
    tagline: "Real-time computer vision with multi-signal confirmation",
    context: "Computer vision · Real-time monitoring",
    categories: ["cv", "ml", "robotics"],
    theme: "vision",
    featured: true,
    summary:
      "A real-time detection pipeline with an operator interface that tracks aerial targets and shows detections, confidence, and target state at a glance.",
    problem:
      "Small drones are hard to spot and easy to misidentify. Before anyone acts on a target, an operator needs a stable, trustworthy signal, not a flickering stream of raw detections. The work focused on stable signals, fast iteration, and clear operator feedback.",
    built: [
      "Built the real-time detection pipeline and the monitoring interface that presents detections, confidence, and target state.",
      "The operator view overlays tracked detections with persistent IDs, exposes the confidence and IoU thresholds, and shows a visual range estimate.",
      "The operator view combines visual, audio, and RF status into one confirmation readout, next to per-channel panels and operator controls.",
    ],
    stack: ["Object detection", "Multi-object tracking", "Real-time video", "Visual · audio · RF status", "Operator UI"],
    image: { base: "drone-detection", alt: "Drone detection interface showing tracked targets with ID labels, a range estimate, and a fused confirmation panel over a sky video feed", position: "50% 45%" },
    gallery: [
      { src: "images/projects/drone-detection-full", alt: "Drone detection operator interface with tracked targets, thresholds, range estimate, and audio and RF status", caption: "Operator view: tracked detections with IDs, confidence and IoU thresholds, a fused range estimate, and audio and RF channels." },
    ],
    privateNote: "Project work, source not public",
  },
  {
    id: "drone-hardware",
    title: "AI-Integrated Drone Hardware",
    tagline: "Embedded prototyping with onboard compute",
    context: "Hardware prototyping",
    categories: ["robotics"],
    theme: "robotics",
    summary:
      "Built and tuned hardware prototypes that put compute on the airframe, integrating sensors and software logic to support low-latency decisions.",
    problem:
      "A model that runs well on a workstation still has to work on a moving platform with tight power, weight, and compute budgets, where latency directly affects behavior.",
    built: [
      "Built and tuned AI-enabled hardware prototypes around Arduino, Raspberry Pi, and NVIDIA Jetson boards.",
      "Integrated sensors and software logic with onboard compute to support low-latency decisions.",
      "Hands-on multirotor builds: airframe, motors, flight-controller wiring, power distribution, and battery.",
    ],
    stack: ["Raspberry Pi", "NVIDIA Jetson", "Arduino", "ArduPilot", "Embedded systems"],
    image: { base: "drone-hardware", alt: "Carbon-fibre quadcopter frame on a workbench with exposed wiring, flight controller, battery, and a soldering station", position: "42% 50%" },
    gallery: [
      { src: "images/projects/drone-hardware-full", alt: "Quadcopter prototype on a workbench with a soldering station, battery, and onboard compute", caption: "Bench build: airframe, flight controller wiring, power, and onboard compute." },
    ],
    privateNote: "Hardware build, no public repository",
  },
  {
    id: "filter-detection",
    title: "Industrial Filter Detection",
    tagline: "Object detection on real factory imagery",
    context: "Computer vision · Industrial",
    categories: ["cv", "ml"],
    theme: "vision",
    summary:
      "Object detection for industrial equipment images, with dataset checks, edge-case review, and validation of model outputs against real samples to improve reliability.",
    problem:
      "Factory images are messy. The validation samples show filter screens in different states and from different angles, some partly covered by an operator's arms. A detector is only useful if it holds up on exactly those cases.",
    built: [
      "Worked on object detection for industrial images of filter equipment.",
      "Ran dataset checks and reviewed edge cases such as occlusion and changing equipment states.",
      "Validated predictions against real samples to improve reliability.",
    ],
    stack: ["Object detection", "Dataset curation", "Model validation", "Computer vision"],
    image: { svg: "images/projects/filter-detection.svg", alt: "Illustration: a detection box labelled filter around a mesh filter inside equipment housing, with validation samples for open, covered, occluded, and angled states" },
    gallery: [
      { svg: "images/projects/filter-detection.svg", alt: "Illustration of single-class object detection on industrial equipment across different states and occlusion", caption: "Original illustration (the real imagery is client data): one class across changing states, angles, and occlusion." },
    ],
    privateNote: "Project work, source not public",
  },
  {
    id: "signature-forgery",
    title: "Signature Forgery Detection",
    tagline: "YOLOv3 detector for forged signatures across image, webcam, and video input",
    context: "Deep learning · Computer vision",
    categories: ["cv", "ml"],
    theme: "vision",
    summary:
      "A deep learning system that flags forged signatures from an imported image, a live webcam feed, or an imported video, using a detector trained with the YOLOv3 algorithm.",
    problem:
      "Signature checks are still often done by eye. A detector that works on scans, live camera input, and video can surface likely forgeries for closer human review.",
    built: [
      "Built a signature forgery detection project using deep learning and computer vision.",
      "Handled data preparation, training, and testing, and documented the results with clear examples.",
      "The app offers three input modes: image import, live webcam feed, and video import.",
    ],
    stack: ["YOLOv3", "Deep learning", "Object detection", "Webcam & video inference"],
    image: { svg: "images/projects/signature-forgery.svg", alt: "Illustration: a questioned signature flagged as possibly forged next to a genuine reference, with image, webcam, and video input modes" },
    gallery: [
      { svg: "images/projects/signature-forgery.svg", alt: "Illustration of signature comparison and the three input modes", caption: "Original illustration: questioned vs. reference signature, and the three input modes." },
    ],
    links: [
      { label: "Read the paper (PDF)", url: "https://drive.google.com/file/d/1VCzYPkQPuQFr1YqHOfZbP2lzamreavlI/view?usp=sharing", type: "doc" },
    ],
  },
  {
    id: "thyrocare",
    title: "ThyroCare",
    tagline: "Thyroid screening app backed by an XGBoost model served through a Flask API",
    context: "Undergraduate thesis · 2022 · Three-person team",
    categories: ["ml", "software", "data"],
    theme: "neural",
    summary:
      "A Flutter Android app that sends five thyroid lab values (TSH, T3, TT4, T4U, FTI) to a Flask REST API serving a three-class XGBoost classifier, which returns hyperthyroidism, hypothyroidism, or euthyroidism. The app also handles sign-in and medicine reminders.",
    problem:
      "Thyroid disorders are common, and the raw records behind this project were heavily imbalanced: about 1,700 normal cases against roughly 300 hyperthyroid and 220 hypothyroid ones. The team balanced the data with synthetic generation, compared tree-based ensembles, and put the result in a phone app so people could check lab results and keep track of medication. It is an educational screening prototype, not a medical device.",
    built: [
      "Frontend and backend developer on a three-person thesis team.",
      "Built the Flutter app: Firebase email/password authentication, a validated blood-test form with result screens, profile management with Firebase Storage, and a medicine scheduler with recurring local notifications (BLoC pattern with rxdart and Provider).",
      "Built the Flask and Gunicorn inference API that loaded the team's trained XGBoost model and served predictions over REST from Heroku.",
    ],
    stack: ["Flutter", "Dart", "Python", "Flask", "XGBoost", "scikit-learn", "pandas", "Firebase"],
    image: { base: "thyrocare", alt: "Three ThyroCare app screens: home, login, and the blood test feature onboarding", position: "50% 40%" },
    gallery: [
      { src: "images/projects/thyrocare-full", alt: "ThyroCare app screens with a project summary and technology logos", caption: "App screens: home, sign-in, and blood-test onboarding." },
      { src: "images/projects/thyrocare-synthetic-full", alt: "Grid of charts comparing synthetic and original distributions of thyroid dataset features for the hypothyroid class", caption: "Synthetic vs. original feature distributions for the hypothyroid class, from the team's synthetic-data generation step." },
    ],
    links: [
      { label: "App source", url: "https://github.com/msumalague/ThyroCare-Application", type: "github" },
      { label: "Team ML notebooks", url: "https://github.com/msumalague/ThyroCare-Supervised-Machine-Learning-Model", type: "github" },
    ],
    note: "The team's modeling work (missing-value handling, label encoding, and a comparison of Random Forest, Gradient Boosting, HistGradientBoosting, AdaBoost, and XGBoost plus a soft-voting ensemble on a class-balanced synthetic dataset) is published in the companion ML notebooks repository. The Heroku backend has since been retired, so there is no live demo; the app repository README includes screenshots and a demo video.",
  },
  {
    id: "iot-device-identification",
    title: "IoT Device Type Identification",
    tagline: "Classifying 10 IoT device types from network-traffic features",
    context: "Personal project · 2022",
    categories: ["ml", "data"],
    theme: "neural",
    summary:
      "An XGBoost classifier that predicts which of 10 IoT device types produced a network session, from baby monitors to thermostats and smart sockets, with a Streamlit input form.",
    problem:
      "Knowing what kinds of devices are on a network is a starting point for asset inventory and security monitoring. This project tests whether device type can be inferred from traffic statistics alone.",
    built: [
      "Explored a 1,000-session dataset with 297 traffic features and 10 balanced device classes.",
      "Ranked features by XGBoost importance and reduced the model to five: average HTTP time, average TTL, and three packet inter-arrival statistics.",
      "Trained and evaluated the reduced model with a confusion matrix and per-class precision, recall, and F1, then scored it on a separate held-out file.",
      "Built a Streamlit input form for the five features.",
    ],
    stack: ["Python", "XGBoost", "scikit-learn", "pandas", "Streamlit", "Jupyter"],
    image: { svg: "images/projects/iot-network.svg", alt: "Diagram: the top five traffic features by XGBoost importance feed a classifier that outputs one of ten IoT device types" },
    gallery: [
      { svg: "images/projects/iot-network.svg", alt: "Pipeline diagram. Top five features by XGBoost importance: http_time_avg 0.249, ttl_avg 0.117, packet_inter_arrivel_B_firstQ 0.095, packet_inter_arrivel_A_sum 0.094, packet_inter_arrivel_B_min 0.064. They feed an XGBoost classifier that outputs one of 10 device types: baby monitor, lights, motion sensor, security camera, smoke detector, socket, thermostat, TV, watch, water sensor.", caption: "Pipeline: the top five features by XGBoost importance feed a 10-class classifier. Importance values are from the project notebook." },
    ],
    links: [
      { label: "Source", url: "https://github.com/msumalague/IoT-Device-Type-Identification-Using-Machine-Learning", type: "github" },
    ],
  },
  {
    id: "bookify",
    title: "Bookify",
    tagline: "Hotel stay booking app: UI/UX concept",
    context: "Product design",
    categories: ["software"],
    theme: "product",
    summary:
      "A hotel and homestay booking app concept that helps people find stays within their budget and preferences, with a smooth booking flow.",
    problem:
      "Booking flows tend to bury the things travelers actually filter on. Bookify puts budget and stay preferences up front.",
    built: [
      "Designed the product concept and high-fidelity mobile screens in Figma, covering search, popular stays, and recommendations.",
      "Created the brand mark and presentation visuals in Photoshop.",
    ],
    stack: ["Figma", "Photoshop", "UI/UX design", "Mobile"],
    image: { base: "bookify", alt: "Bookify app concept: logo and two phone mockups showing the home and splash screens", position: "50% 50%" },
    gallery: [
      { src: "images/projects/bookify-full", alt: "Bookify UI/UX presentation with phone mockups", caption: "Concept presentation: home screen with search, popular stays, and recommendations." },
    ],
    privateNote: "Design concept",
  },
];

window.PORTFOLIO_FILTERS = {
  all: "All",
  ml: "AI / ML",
  genai: "GenAI & Agents",
  cv: "Computer Vision",
  robotics: "Robotics & Edge AI",
  data: "Data",
  software: "Software & Mobile",
};
