/**
 * Project data for the portfolio.
 *
 * To add a project, append an object to PORTFOLIO_PROJECTS. Fields:
 *   id          unique slug (used for the dialog URL hash)
 *   title       project name
 *   tagline     one line, shown under the title
 *   context     short provenance line, e.g. "Personal project · 2022"
 *   categories  any of: ml, cv, robotics, data, software (drive the filters)
 *   theme       card visual treatment: vision | neural | robotics | data | product
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
    id: "thyrocare",
    title: "ThyroCare",
    tagline: "Thyroid screening app backed by an XGBoost model served through a Flask API",
    context: "Undergraduate thesis · 2022 · Three-person team",
    categories: ["ml", "software", "data"],
    theme: "neural",
    featured: true,
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
      { src: "images/projects/data-analysis-full", alt: "Grid of charts comparing synthetic and original distributions of thyroid dataset features for the hypothyroid class", caption: "Synthetic vs. original feature distributions for the hypothyroid class, from the team's synthetic-data generation step." },
    ],
    links: [
      { label: "App source", url: "https://github.com/msumalague/ThyroCare-Application", type: "github" },
      { label: "Team ML notebooks", url: "https://github.com/msumalague/ThyroCare-Supervised-Machine-Learning-Model", type: "github" },
    ],
    note: "The team's modeling work (missing-value handling, label encoding, and a comparison of Random Forest, Gradient Boosting, HistGradientBoosting, AdaBoost, and XGBoost plus a soft-voting ensemble on a class-balanced synthetic dataset) is published in the companion ML notebooks repository. The Heroku backend has since been retired, so there is no live demo; the app repository README includes screenshots and a demo video.",
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
    image: { base: "filter-detection", alt: "Grid of factory images with blue bounding boxes labelled filter around industrial filter screens", position: "50% 20%" },
    gallery: [
      { src: "images/projects/filter-detection-full", alt: "Validation batch of industrial images with filter bounding boxes", caption: "Annotated validation batch: one class across changing states, angles, and occlusion." },
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
    image: { base: "signature-forgery", alt: "Signature Forgery Detection System interface with image, webcam, and video input options", position: "50% 50%" },
    gallery: [
      { src: "images/projects/signature-forgery-full", alt: "Signature forgery detection app start screen with image, webcam, and video modes", caption: "App start screen with the three input modes." },
    ],
    links: [
      { label: "Read the paper (PDF)", url: "https://drive.google.com/file/d/1VCzYPkQPuQFr1YqHOfZbP2lzamreavlI/view?usp=sharing", type: "doc" },
    ],
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
    id: "data-analysis",
    title: "Data Analysis & Benchmarking",
    tagline: "Clean inputs and comparative reporting",
    context: "Analytics work",
    categories: ["data"],
    theme: "data",
    summary:
      "Cleaning, analysis, and benchmarking work that turns raw datasets into model-ready inputs and clear comparative reporting.",
    problem:
      "Models and reports are only as good as their inputs. Consistent cleaning, summaries, and comparative views make both easier to trust.",
    built: [
      "Cleaned and analyzed datasets for machine learning use.",
      "Built summaries and visuals to support better model inputs and more consistent reporting.",
      "Produced benchmarking and comparative analyses, such as percentile breakdowns across industries.",
    ],
    stack: ["Python", "pandas", "Plotly", "Exploratory data analysis", "Benchmarking"],
    image: { base: "benchmark", alt: "Dot plot of monthly new-user growth rate by industry at the 50th, 75th, and 90th percentiles", position: "50% 30%" },
    gallery: [
      { src: "images/projects/benchmark-full", alt: "Industry benchmark chart of monthly new-user growth rate percentiles", caption: "Benchmarking: growth-rate percentiles compared across industries." },
    ],
    privateNote: "Analysis work, data not public",
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
  cv: "Computer Vision",
  robotics: "Robotics & Edge AI",
  data: "Data",
  software: "Software & Mobile",
};
