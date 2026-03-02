
// This file acts as a local "Cache" of the NIE Syllabus structure.
// Using this saves massive amounts of AI tokens.

export interface SyllabusUnit {
    unit: string;
    topics: string[];
    explanation?: string; // Added for more context
}

export interface GradeSyllabus {
    [subjectName: string]: SyllabusUnit[];
}

// PASTE YOUR GENERATED JSON CONTENT INTO THE RESPECTIVE GRADE OBJECTS BELOW
export const SYLLABUS_DB: Record<string, GradeSyllabus> = {
    "6 ශ්‍රේණිය (Grade 6)": {
        // Paste Grade 6 JSON here
    },
    "7 ශ්‍රේණිය (Grade 7)": {
        // Paste Grade 7 JSON here
    },
    "8 ශ්‍රේණිය (Grade 8)": {
        // Paste Grade 8 JSON here
    },
    "9 ශ්‍රේණිය (Grade 9)": {
        // Paste Grade 9 JSON here
    },
    "10 ශ්‍රේණිය (Grade 10)": {
        "Mathematics": [
            { unit: "Unit 1: Perimeter", topics: ["Perimeter of rectilinear plane figures"], explanation: "Covers calculating the total length around flat shapes with straight sides." },
            { unit: "Unit 2: Surface Area", topics: ["Surface area of a prism", "Surface area of a cylinder"], explanation: "Focuses on finding the total area of all faces of 3D shapes like prisms and cylinders." },
            { unit: "Unit 3: Fractions", topics: ["Adding and subtracting algebraic fractions"], explanation: "Teaches how to perform addition and subtraction on fractions that contain variables." },
            { unit: "Unit 4: Binomial Expressions", topics: ["Factors of binomial expressions"], explanation: "Explores how to find the factors of expressions containing two terms." },
            { unit: "Unit 5: Congruency", topics: ["Conditions for congruency of triangles"], explanation: "Introduces the rules (SSS, SAS, ASA, RHS) to determine if two triangles are identical in shape and size." },
            { unit: "Unit 6: Area", topics: ["Area of triangles", "Area of quadrilaterals"], explanation: "Covers formulas and methods to calculate the area of triangles and various four-sided shapes." },
            { unit: "Unit 7: Factors", topics: ["Factors of quadratic expressions"], explanation: "Deals with factoring expressions in the form ax² + bx + c." },
            { unit: "Unit 8: Equations", topics: ["Simultaneous equations"], explanation: "Teaches methods to solve a system of two linear equations with two variables at the same time." },
            { unit: "Unit 9: Data Representation", topics: ["Pie charts", "Histograms"], explanation: "Focuses on visually representing data using circular graphs (pie charts) and bar charts for continuous data (histograms)." },
            { unit: "Unit 10: Probability", topics: ["Sample space", "Events"], explanation: "Introduces the fundamental concepts of probability, including all possible outcomes (sample space) and specific outcomes (events)." }
        ],
        "Science": [
            { unit: "Unit 1: Chemical Basis of Life", topics: ["Biomolecules", "Water", "Minerals"], explanation: "Introduces the essential molecules like carbohydrates, proteins, and the roles of water and minerals in living organisms." },
            { unit: "Unit 2: Motion", topics: ["Linear motion", "Distance-time graphs"], explanation: "Explores the concepts of speed, velocity, and acceleration using distance-time graphs to represent motion." },
            { unit: "Unit 3: Matter", topics: ["Structure of atom", "Periodic table"], explanation: "Covers the basic structure of an atom (protons, neutrons, electrons) and the organization of elements in the periodic table." },
            { unit: "Unit 4: Force", topics: ["Resultant force", "Newton's laws"], explanation: "Introduces Newton's Three Laws of Motion and the concept of finding the net (resultant) force acting on an object." },
            { unit: "Unit 5: Friction", topics: ["Static and dynamic friction"], explanation: "Differentiates between the force that prevents motion (static friction) and the force that opposes motion (dynamic friction)." },
            { unit: "Unit 6: Plant Tissues", topics: ["Meristematic tissues", "Permanent tissues"], explanation: "Explores the different types of tissues in plants, focusing on growing tissues (meristematic) and specialized tissues (permanent)." },
            { unit: "Unit 7: Elements", topics: ["Classification of elements", "Properties"], explanation: "Focuses on how elements are classified (metals, non-metals, metalloids) and their characteristic properties." }
        ],
        "History": [
            { unit: "Unit 1: Sources of History", topics: ["Literary sources", "Archaeological sources"], explanation: "Explores the different types of evidence historians use, such as written texts and physical artifacts from the past." },
            { unit: "Unit 2: Settlements in Sri Lanka", topics: ["Pre-historic settlements"], explanation: "Focuses on the earliest human settlements in Sri Lanka before written records began." },
            { unit: "Unit 3: Ancient Civilization", topics: ["River valley civilizations"], explanation: "Studies the major ancient civilizations that emerged along river valleys, such as Mesopotamia, Egypt, and the Indus Valley." },
            { unit: "Unit 4: Anuradhapura Kingdom", topics: ["Political history", "Technology"], explanation: "Covers the political structure, rulers, and technological advancements (like irrigation) of the Anuradhapura period." }
        ],
        "English": [
            { unit: "Unit 1: People and Places", topics: ["Describing people", "Writing formal letters"], explanation: "Focuses on vocabulary for describing appearances and personalities, and the structure of formal letter writing." },
            { unit: "Unit 2: Health is Wealth", topics: ["Modals", "Reading comprehension"], explanation: "Introduces modal verbs (can, should, must) and develops skills in understanding and interpreting written passages about health." },
            { unit: "Unit 3: A Better World", topics: ["Future tense", "Essay writing"], explanation: "Covers the use of future tenses (will, going to) and practices the structure and composition of essays." }
        ],
        "Sinhala": [
            { unit: "Unit 1: ව්‍යාකරණ", topics: ["උක්ත ආඛ්‍යාත සම්බන්ධය"], explanation: "මෙම ඒකකය මගින් වාක්‍යයක උක්තය සහ ආඛ්‍යාතය අතර ඇති නිවැරදි සම්බන්ධතාවය හඳුනාගැනීමට උගන්වයි." },
            { unit: "Unit 2: සාහිත්‍යය", topics: ["ගුත්තිල කාව්‍යය", "කෙටි කතා"], explanation: "ගුත්තිල කාව්‍යයේ රසවින්දනය සහ කෙටි කතා කලාවේ ලක්ෂණ පිළිබඳව අවධානය යොමු කරයි." },
            { unit: "Unit 3: රචනා", topics: ["විචාරාත්මක රචනා"], explanation: "සාහිත්‍ය කෘතියක් හෝ මාතෘකාවක් පිළිබඳව තර්කානුකූලව සහ සාක්ෂි සහිතව විචාරයක් ලියන ආකාරය පුහුණු කරයි." }
        ]
    },
    "11 ශ්‍රේණිය (Grade 11)": {
        "Mathematics": [
            { unit: "Unit 1: Real Numbers", topics: ["Irrational numbers", "Surds"], explanation: "Expands on the number system to include numbers that cannot be written as simple fractions and operations involving square roots." },
            { unit: "Unit 2: Indices and Logarithms", topics: ["Laws of indices", "Logarithmic form"], explanation: "Covers the rules for manipulating powers and introduces logarithms as the inverse of exponentiation." },
            { unit: "Unit 3: Surface Area and Volume", topics: ["Pyramids", "Cones", "Spheres"], explanation: "Focuses on calculating the surface area and volume of more complex 3D shapes like pyramids, cones, and spheres." },
            { unit: "Unit 4: Binomial Expansions", topics: ["Pascal's triangle"], explanation: "Introduces methods for expanding expressions of the form (a+b)ⁿ using tools like Pascal's triangle." },
            { unit: "Unit 5: Algebraic Fractions", topics: ["Multiplication and division"], explanation: "Builds on fraction knowledge to include multiplying and dividing algebraic fractions." },
            { unit: "Unit 6: Area", topics: ["Area of sectors", "Area of segments"], explanation: "Teaches how to calculate the area of a 'slice' of a circle (sector) and the area of a region cut off by a chord (segment)." },
            { unit: "Unit 7: Inequalities", topics: ["Linear inequalities", "Quadratic inequalities"], explanation: "Covers solving and representing inequalities with one or two variables, including quadratic inequalities." }
        ],
        "Science": [
            { unit: "Unit 1: Human Body", topics: ["Nervous system", "Endocrine system"], explanation: "Explores the two main control systems of the body: the fast-acting nervous system and the hormone-based endocrine system." },
            { unit: "Unit 2: Chemical Changes", topics: ["Rates of reaction", "Energy changes"], explanation: "Investigates factors affecting the speed of chemical reactions and whether reactions release or absorb energy." },
            { unit: "Unit 3: Heat", topics: ["Thermal expansion", "Heat transfer"], explanation: "Covers how substances expand when heated and the three methods of heat transfer: conduction, convection, and radiation." },
            { unit: "Unit 4: Power and Energy", topics: ["Work", "Power", "Energy resources"], explanation: "Defines the physics concepts of work and power, and discusses different sources of energy." },
            { unit: "Unit 5: Electronics", topics: ["Semiconductors", "Diodes", "Transistors"], explanation: "Introduces the basic components of electronic circuits, including semiconductors, diodes, and transistors, and their functions." }
        ]
    },
    "12 ශ්‍රේණිය (Grade 12)": {
        // Paste Grade 12 JSON here
    },
    "13 ශ්‍රේණිය (Grade 13)": {
        // Paste Grade 13 JSON here
    }
};

// Helper to normalize subject names (e.g., "Maths" -> "Mathematics")
export const normalizeSubject = (input: string): string => {
    const lower = input.toLowerCase();
    if (lower.includes('math') || lower.includes('ගණිත')) return 'Mathematics';
    if (lower.includes('sci') || lower.includes('විද්‍යා')) return 'Science';
    if (lower.includes('hist') || lower.includes('ඉතිහාස')) return 'History';
    if (lower.includes('eng') || lower.includes('ඉංග්‍රීසි')) return 'English';
    if (lower.includes('sin') || lower.includes('සිංහල')) return 'Sinhala';
    if (lower.includes('bud') || lower.includes('බුද්ධ')) return 'Buddhism';
    return input; // Return original if no match
};