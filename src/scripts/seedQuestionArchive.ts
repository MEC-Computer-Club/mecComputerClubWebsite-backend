import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import QuestionArchive from "../models/QuestionArchive.model";
import User from "../models/User.model";
import Course from "../models/Course.model";
import { connectDB } from "../config/db.config";

export const SAMPLE_QUESTIONS = [
  // CSE - Semester 1
  {
    courseCode: "CSE-1101",
    courseName: "Fundamentals of Computers and Computing",
    department: "CSE",
    semester: 1,
    year: 2024,
    examType: "Semester Final",
    session: "2023-24",
    description: "Official Semester Final question paper for CSE-1101. Covers computer architecture, number systems, and binary logic.",
    tags: ["Final", "Computer Architecture", "Number Systems"],
  },
  {
    courseCode: "CSE-1101",
    courseName: "Fundamentals of Computers and Computing",
    department: "CSE",
    semester: 1,
    year: 2024,
    examType: "CT1",
    session: "2023-24",
    description: "Class Test 1 covering basic architecture, CPU components, and data representation.",
    tags: ["CT1", "Class Test", "CPU"],
  },
  {
    courseCode: "CSE-1101",
    courseName: "Fundamentals of Computers and Computing",
    department: "CSE",
    semester: 1,
    year: 2024,
    examType: "CT2",
    session: "2023-24",
    description: "Class Test 2 covering memory hierarchy and operating systems overview.",
    tags: ["CT2", "Class Test", "Memory"],
  },
  {
    courseCode: "CSE-1102",
    courseName: "Discrete Mathematics",
    department: "CSE",
    semester: 1,
    year: 2023,
    examType: "Semester Final",
    session: "2022-23",
    description: "Semester Final exam covering proposition logic, predicate calculus, graph theory, and set theory.",
    tags: ["Final", "Graph Theory", "Logic", "Discrete Math"],
  },
  {
    courseCode: "CSE-1102",
    courseName: "Discrete Mathematics",
    department: "CSE",
    semester: 1,
    year: 2023,
    examType: "CT1",
    session: "2022-23",
    description: "Class test 1 on propositions, truth tables, and mathematical induction.",
    tags: ["CT1", "Induction", "Logic"],
  },
  {
    courseCode: "CSE-1102",
    courseName: "Discrete Mathematics",
    department: "CSE",
    semester: 1,
    year: 2023,
    examType: "CT2",
    session: "2022-23",
    description: "Class test 2 on relations, functions, and recurrence relations.",
    tags: ["CT2", "Relations", "Functions"],
  },

  // CSE - Semester 2
  {
    courseCode: "CSE-1201",
    courseName: "Fundamentals of Programming",
    department: "CSE",
    semester: 2,
    year: 2024,
    examType: "Semester Final",
    session: "2023-24",
    description: "C Programming language final exam: pointers, dynamic memory allocation, structs, and file I/O.",
    tags: ["Final", "C Programming", "Pointers", "File IO"],
  },
  {
    courseCode: "CSE-1201",
    courseName: "Fundamentals of Programming",
    department: "CSE",
    semester: 2,
    year: 2024,
    examType: "CT1",
    session: "2023-24",
    description: "Class test 1 on control structures, loops, and basic functions.",
    tags: ["CT1", "C Loops", "Functions"],
  },
  {
    courseCode: "CSE-1201",
    courseName: "Fundamentals of Programming",
    department: "CSE",
    semester: 2,
    year: 2024,
    examType: "CT2",
    session: "2023-24",
    description: "Class test 2 on arrays, multi-dimensional matrices, and strings.",
    tags: ["CT2", "Arrays", "Strings"],
  },
  {
    courseCode: "CSE-1201",
    courseName: "Fundamentals of Programming",
    department: "CSE",
    semester: 2,
    year: 2024,
    examType: "CT3",
    session: "2023-24",
    description: "Class test 3 on pointers and memory allocation.",
    tags: ["CT3", "Pointers"],
  },
  {
    courseCode: "CSE-1202",
    courseName: "Digital Logic Design",
    department: "CSE",
    semester: 2,
    year: 2023,
    examType: "Semester Final",
    session: "2022-23",
    description: "K-map simplification, sequential circuits, flip-flops, counters, and registers.",
    tags: ["Final", "Digital Logic", "Flip-Flops", "Counters"],
  },

  // CSE - Semester 3
  {
    courseCode: "CSE-2101",
    courseName: "Data Structures and Algorithms",
    department: "CSE",
    semester: 3,
    year: 2024,
    examType: "Semester Final",
    session: "2023-24",
    description: "Trees, graphs, heaps, sorting algorithms, and complexity analysis.",
    tags: ["Final", "Data Structures", "Trees", "Graphs", "Algorithms"],
  },
  {
    courseCode: "CSE-2101",
    courseName: "Data Structures and Algorithms",
    department: "CSE",
    semester: 3,
    year: 2024,
    examType: "CT1",
    session: "2023-24",
    description: "Class test 1 on asymptotic analysis, stacks, and queues.",
    tags: ["CT1", "Stacks", "Queues"],
  },
  {
    courseCode: "CSE-2101",
    courseName: "Data Structures and Algorithms",
    department: "CSE",
    semester: 3,
    year: 2024,
    examType: "CT2",
    session: "2023-24",
    description: "Class test 2 on linked lists and binary search trees.",
    tags: ["CT2", "BST", "Linked Lists"],
  },
  {
    courseCode: "CSE-2102",
    courseName: "Object Oriented Programming",
    department: "CSE",
    semester: 3,
    year: 2023,
    examType: "Semester Final",
    session: "2022-23",
    description: "C++/Java object-oriented concepts: inheritance, polymorphism, templates, and exception handling.",
    tags: ["Final", "OOP", "Polymorphism", "Java", "C++"],
  },

  // CSE - Semester 4
  {
    courseCode: "CSE-2201",
    courseName: "Database Management Systems-I",
    department: "CSE",
    semester: 4,
    year: 2023,
    examType: "Semester Final",
    session: "2022-23",
    description: "ER Modeling, relational algebra, SQL queries, normalization up to BCNF, and indexing.",
    tags: ["Final", "DBMS", "SQL", "Normalization"],
  },
  {
    courseCode: "CSE-2201",
    courseName: "Database Management Systems-I",
    department: "CSE",
    semester: 4,
    year: 2023,
    examType: "CT1",
    session: "2022-23",
    description: "Class test 1 on ER diagrams and relational models.",
    tags: ["CT1", "ER Diagrams"],
  },

  // EEE - Semester 1 & 2
  {
    courseCode: "EEE-1101",
    courseName: "Electrical Circuits I",
    department: "EEE",
    semester: 1,
    year: 2024,
    examType: "Semester Final",
    session: "2023-24",
    description: "DC circuit analysis: Ohm's law, Kirchhoff's laws, Thevenin and Norton theorems, superposition.",
    tags: ["Final", "Circuits", "Thevenin", "Kirchhoff"],
  },
  {
    courseCode: "EEE-1101",
    courseName: "Electrical Circuits I",
    department: "EEE",
    semester: 1,
    year: 2024,
    examType: "CT1",
    session: "2023-24",
    description: "Class test 1 on mesh and nodal analysis.",
    tags: ["CT1", "Mesh Analysis", "Nodal Analysis"],
  },
  {
    courseCode: "EEE-1101",
    courseName: "Electrical Circuits I",
    department: "EEE",
    semester: 1,
    year: 2024,
    examType: "CT2",
    session: "2023-24",
    description: "Class test 2 on network theorems and maximum power transfer.",
    tags: ["CT2", "Network Theorems"],
  },
  {
    courseCode: "EEE-1201",
    courseName: "Electrical Circuits II",
    department: "EEE",
    semester: 2,
    year: 2023,
    examType: "Semester Final",
    session: "2022-23",
    description: "AC circuit analysis: Phasors, sinusoidal steady-state analysis, 3-phase circuits, resonance.",
    tags: ["Final", "AC Circuits", "Phasors", "Resonance"],
  },

  // CE (Civil Engineering) - Semester 1 & 2
  {
    courseCode: "CE-102",
    courseName: "Engineering Mechanics",
    department: "CE",
    semester: 1,
    year: 2024,
    examType: "Semester Final",
    session: "2023-24",
    description: "Statics of particles, rigid bodies, equilibrium, friction, centroids, and moment of inertia.",
    tags: ["Final", "Mechanics", "Statics", "Centroids"],
  },
  {
    courseCode: "CE-102",
    courseName: "Engineering Mechanics",
    department: "CE",
    semester: 1,
    year: 2024,
    examType: "CT1",
    session: "2023-24",
    description: "Class test 1 on 2D force systems and equilibrium equations.",
    tags: ["CT1", "Equilibrium"],
  },
  {
    courseCode: "CE-202",
    courseName: "Surveying",
    department: "CE",
    semester: 2,
    year: 2023,
    examType: "Semester Final",
    session: "2022-23",
    description: "Chain surveying, leveling, contouring, theodolite traverse, and curve setting.",
    tags: ["Final", "Surveying", "Leveling", "Theodolite"],
  },
];

export const seedQuestions = async () => {
  try {
    console.log("Connecting to database for Question Archive seeding...");
    await connectDB();

    // Ensure sample PDF exists in public folder
    const targetDir = path.join(process.cwd(), "public", "uploads", "questions");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const samplePdfPath = path.join(targetDir, "sample-question-paper.pdf");
    if (!fs.existsSync(samplePdfPath)) {
      // Minimal valid single-page PDF structure
      const minimalPdfContent = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>> >> endobj
4 0 obj <</Length 110>> stream
BT
/F1 24 Tf
100 700 Td
(MEC Computer Club - Question Archive) Tj
/F1 14 Tf
0 -40 Td
(Sample Exam Question Paper for Local Testing) Tj
ET
endstream
endobj
5 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000228 00000 n 
0000000388 00000 n 
trailer <</Size 6 /Root 1 0 R>>
startxref
455
%%EOF`;
      fs.writeFileSync(samplePdfPath, minimalPdfContent);
      console.log("Created sample PDF at:", samplePdfPath);
    }

    // Find or create admin user to associate uploads with
    let adminUser = await User.findOne({ role: "admin" });
    if (!adminUser) {
      adminUser = await User.findOne({});
    }
    if (!adminUser) {
      adminUser = await User.create({
        fullName: "MEC CC Admin",
        email: "admin@meccomputerclub.org",
        studentId: "ADMIN-001",
        password: "AdminPassword123!",
        department: "CSE",
        batch: "12",
        session: "2020-21",
        contactNumber: "01700000000",
        isGraduated: false,
        role: "admin",
        isVerified: true,
        applicationStatus: "approved",
      });
      console.log("Created default admin user for question ownership:", adminUser.email);
    }

    let seededCount = 0;

    for (const q of SAMPLE_QUESTIONS) {
      const existing = await QuestionArchive.findOne({
        courseCode: q.courseCode,
        year: q.year,
        examType: q.examType,
      });

      if (!existing) {
        // Find course reference if available
        const course = await Course.findOne({
          courseCode: { $regex: new RegExp(`^${q.courseCode}$`, "i") },
        });

        await QuestionArchive.create({
          title: `${q.courseCode} - ${q.examType} (${q.year})`,
          department: q.department,
          semester: q.semester,
          year: q.year,
          session: q.session,
          examType: q.examType,
          courseCode: q.courseCode,
          courseName: q.courseName,
          course: course?._id || null,
          fileUrl: "/public/uploads/questions/sample-question-paper.pdf",
          filePublicId: "sample-question-paper",
          fileName: `${q.courseCode}_${q.year}_${q.examType.replace(/\s+/g, "_")}.pdf`,
          fileSize: 1024 * 45, // 45 KB
          mimeType: "application/pdf",
          description: q.description,
          tags: q.tags,
          status: "published",
          downloadCount: Math.floor(Math.random() * 50) + 5,
          viewCount: Math.floor(Math.random() * 150) + 20,
          uploadedBy: adminUser._id,
        });
        seededCount++;
      }
    }

    console.log(`Question Archive seeding completed! Seeded ${seededCount} new question papers.`);
    process.exit(0);
  } catch (err) {
    console.error("Error seeding Question Archive:", err);
    process.exit(1);
  }
};

if (require.main === module) {
  seedQuestions();
}
