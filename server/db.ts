import { PrismaClient } from "@prisma/client";

// Prisma Client is generated from this repository's schema during install/build.
// The explicit boundary keeps local type-checking independent from another
// repository's generated client when this project is being extracted.
const prisma: any = new PrismaClient();
export default prisma;
