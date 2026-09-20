import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyFirebaseBearerToken } from "@/src/server/auth";
import { getErrorMessage } from "@/src/server/errors";
import { getAdminDb } from "@/src/server/firebaseAdmin";
import {
  TherapistVerificationStatus,
  UserRole,
} from "@/src/types/database";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["VERIFY", "REJECT"]),
  rejectionReason: z.string().trim().min(3).max(500).optional(),
}).strict().refine((value) => value.action !== "REJECT" || Boolean(value.rejectionReason), {
  message: "A rejection reason is required",
});

function isAdmin(decodedToken: Awaited<ReturnType<typeof verifyFirebaseBearerToken>>): boolean {
  return decodedToken?.admin === true;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ therapistId: string }> }
) {
  try {
    const decodedToken = await verifyFirebaseBearerToken(request);

    if (!decodedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(decodedToken)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { therapistId } = await context.params;
    const parsed = schema.safeParse(await request.json().catch(() => null));

    if (!therapistId || !parsed.success) {
      return NextResponse.json({ error: "A valid therapist ID and action are required" }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const profileRef = adminDb.collection("therapists").doc(therapistId);
    const userRef = adminDb.collection("users").doc(therapistId);

    await adminDb.runTransaction(async (transaction) => {
      const [profileSnapshot, userSnapshot] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(userRef),
      ]);

      const profileData = profileSnapshot.data();

      if (!profileData || !userSnapshot.exists) {
        throw new Error("Therapist application or user profile was not found.");
      }

      if (profileData.verificationStatus !== TherapistVerificationStatus.PENDING) {
        throw new Error("Only pending therapist applications can be reviewed.");
      }

      if (parsed.data.action === "VERIFY") {
        transaction.update(profileRef, {
          isVerified: true,
          verificationStatus: TherapistVerificationStatus.VERIFIED,
          reviewedAt: FieldValue.serverTimestamp(),
          reviewedBy: decodedToken.uid,
          rejectionReason: FieldValue.delete(),
        });
        transaction.update(userRef, {
          role: UserRole.THERAPIST,
          onboardingComplete: true,
        });
        return;
      }

      transaction.update(profileRef, {
        isVerified: false,
        verificationStatus: TherapistVerificationStatus.REJECTED,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: decodedToken.uid,
        rejectionReason: parsed.data.rejectionReason,
      });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const detail = getErrorMessage(error);
    console.error("THERAPIST VERIFICATION API ERROR:", detail, error);

    return NextResponse.json(
      {
        error: process.env.NODE_ENV === "production" ? "Unable to update verification" : detail,
      },
      { status: 500 }
    );
  }
}
