// The fixed checklists from the clinic's paper form (docs/forms/README.md), defined once.
// The API validates against these keys and the Intake screens render these labels. Ticked items
// are stored as a JSON array of keys, so a label can be reworded without touching stored data.
export type Choice = { key: string; label: string };

const choices = (pairs: ReadonlyArray<readonly [string, string]>): Choice[] =>
    pairs.map(([key, label]) => ({ key, label }));

export const CONDITIONS = choices([
    ['hiv-aids', 'HIV/AIDS'],
    ['anemia', 'Anemia'],
    ['arthritis', 'Arthritis'],
    ['artificial-heart-valves', 'Artificial heart valves'],
    ['artificial-joints', 'Artificial joints'],
    ['asthma', 'Asthma'],
    ['back-problems', 'Back problems'],
    ['blood-diseases', 'Blood diseases'],
    ['cancer', 'Cancer'],
    ['chemical-dependency', 'Chemical dependency'],
    ['chemotherapy', 'Chemotherapy'],
    ['circulatory-problems', 'Circulatory problems'],
    ['cortisone-treatments', 'Cortisone treatments'],
    ['persistent-cough', 'Persistent cough'],
    ['cough-up-blood', 'Cough up blood'],
    ['diabetes', 'Diabetes'],
    ['epilepsy', 'Epilepsy'],
    ['fainting', 'Fainting'],
    ['glaucoma', 'Glaucoma'],
    ['headaches', 'Headaches'],
    ['heart-murmur', 'Heart murmur'],
    ['heart-problems', 'Heart problems'],
    ['hemophilia', 'Hemophilia'],
    ['hepatitis', 'Hepatitis'],
    ['high-blood-pressure', 'High blood pressure'],
    ['jaw-pain', 'Jaw pain'],
    ['kidney-disease', 'Kidney disease'],
    ['liver-disease', 'Liver disease'],
    ['mitral-valve-prolapse', 'Mitral valve prolapse'],
    ['nervous-problems', 'Nervous problems'],
    ['pacemaker', 'Pacemaker'],
    ['psychiatric-care', 'Psychiatric care'],
    ['radiation-treatment', 'Radiation treatment'],
    ['respiratory-disease', 'Respiratory disease'],
    ['rheumatic-fever', 'Rheumatic fever'],
    ['scarlet-fever', 'Scarlet fever'],
    ['shortness-of-breath', 'Shortness of breath'],
    ['skin-rash', 'Skin rash'],
    ['stroke', 'Stroke'],
    ['swelling-feet-ankles', 'Swelling feet/ankles'],
    ['thyroid-problems', 'Thyroid problems'],
    ['tobacco-habits', 'Tobacco habits'],
    ['tonsillitis', 'Tonsillitis'],
    ['tuberculosis', 'Tuberculosis'],
    ['ulcer', 'Ulcer'],
    ['venereal-disease', 'Venereal disease'],
]);

export const ALLERGIES = choices([
    ['aspirin', 'Aspirin'],
    ['barbiturates', 'Barbiturates (sleeping pills)'],
    ['codeine', 'Codeine'],
    ['penicillin', 'Penicillin'],
    ['sulfa', 'Sulfa'],
    ['local-anesthetic', 'Local anesthetic'],
]);

export const SYMPTOMS = choices([
    ['bad-breath', 'Bad breath'],
    ['bleeding-gums', 'Bleeding gums'],
    ['clicking-popping-jaw', 'Clicking or popping jaw'],
    ['food-collection', 'Food collection between teeth'],
    ['grinding-teeth', 'Grinding teeth'],
    ['loose-teeth-broken-fillings', 'Loose teeth/broken fillings'],
    ['periodontal-problems', 'Periodontal problems'],
    ['sensitivity-cold', 'Sensitivity to cold'],
    ['sensitivity-hot', 'Sensitivity to hot'],
    ['sensitivity-sweets', 'Sensitivity to sweets'],
    ['sensitivity-biting', 'Sensitivity when biting'],
    ['mouth-sores', 'Sores or growths in your mouth'],
]);

export const labelOf = (list: Choice[], key: string) => list.find((c) => c.key === key)?.label ?? key;
