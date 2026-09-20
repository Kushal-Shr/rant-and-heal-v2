import { FieldValue } from "firebase-admin/firestore";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import { TherapistVerificationStatus } from "@/src/types/database";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  specialty: z.string().trim().min(1).max(300),
  licenseNo: z.string().trim().min(1).max(100),
  bio: z.string().trim().min(1).max(3000),
  availability: z.record(z.string(), z.unknown()),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const token = await verifyFirebaseBearerToken(request);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid therapist application" }, { status: 400 });

    const profileRef = getAdminDb().collection("therapists").doc(token.uid);
    const verificationStatus = await getAdminDb().runTransaction(async (transaction) => {
      const existing = await transaction.get(profileRef);
      const profile = existing.data();
      const currentStatus = profile?.verificationStatus;

      if (profile?.isVerified === true || currentStatus === TherapistVerificationStatus.VERIFIED) {
        return TherapistVerificationStatus.VERIFIED;
      }

      const fields = {
        therapistId: token.uid,
        ...parsed.data,
        isVerified: false,
        verificationStatus: TherapistVerificationStatus.PENDING,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (existing.exists) {
        transaction.set(profileRef, {
          ...fields,
          ...(currentStatus === TherapistVerificationStatus.REJECTED
            ? { rejectionReason: FieldValue.delete(), reappliedAt: FieldValue.serverTimestamp() }
            : {}),
        }, { merge: true });
      } else {
        transaction.create(profileRef, {
          ...fields,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      return TherapistVerificationStatus.PENDING;
    });

    return NextResponse.json({ verificationStatus });
  } catch (error) {
    const detail = getErrorMessage(error);
    console.error("THERAPIST APPLICATION API ERROR:", detail);
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Could not save therapist application" : detail },
      { status: 500 }
    );
  }
}
