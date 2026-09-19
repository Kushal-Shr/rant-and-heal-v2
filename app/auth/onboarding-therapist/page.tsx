"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorMessage } from "@/src/components/forms/ErrorMessage";
import { Input } from "@/src/components/forms/Input";
import { Label } from "@/src/components/forms/Label";
import { Textarea } from "@/src/components/forms/Textarea";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Spinner } from "@/src/components/ui/Spinner";
import { useAuth } from "@/src/context/AuthContext";
import {
  getTherapistProfile,
  submitTherapistApplication,
} from "@/src/services/therapistService";
import { TherapistVerificationStatus } from "@/src/types/database";

export default function TherapistOnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [bio, setBio] = useState("");
  const [availability, setAvailability] = useState("Weekdays by appointment");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<TherapistVerificationStatus | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/auth/provider/login");
      return;
    }

    if (!user?.uid) {
      return;
    }

    getTherapistProfile(user.uid)
      .then((profile) => {
        if (!profile) {
          setName(user.displayName ?? "");
          return;
        }

        setName(profile.name);
        setSpecialty(profile.specialty);
        setLicenseNo(profile.licenseNo);
        setBio(profile.bio);
        setVerificationStatus(profile.verificationStatus ?? (profile.isVerified ? TherapistVerificationStatus.VERIFIED : TherapistVerificationStatus.PENDING));
        setAvailability(
          typeof profile.availability.summary === "string"
            ? profile.availability.summary
            : "Weekdays by appointment"
        );
      })
      .catch((profileError) => {
        console.error("Failed to load therapist profile:", profileError);
      });
  }, [authLoading, router, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.uid) {
      router.replace("/auth/provider/login");
      return;
    }

    if (!name.trim() || !specialty.trim() || !licenseNo.trim() || !bio.trim()) {
      setError("Name, specialty, license, and bio are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const nextVerificationStatus = await submitTherapistApplication(user.uid, {
        name: name.trim(),
        specialty: specialty.trim(),
        licenseNo: licenseNo.trim(),
        bio: bio.trim(),
        availability: { summary: availability.trim() || "Weekdays by appointment" },
      });

      setVerificationStatus(nextVerificationStatus);
    } catch (submitError) {
      console.error("Failed to save therapist onboarding:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not save your practitioner profile."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-[calc(100dvh-5rem)] md:min-h-dvh items-center justify-center bg-[#fff8f5]">
        <Spinner size="lg" label="Loading practitioner onboarding" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-5rem)] md:min-h-dvh px-6 py-10 font-['Plus_Jakarta_Sans'] text-[#2c1601]">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section>
          <Link href="/" className="inline-flex items-center gap-3 font-medium text-[#325347]">
            <span className="flex size-11 items-center justify-center rounded-full bg-[#c6ebda] shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),0_8px_16px_-8px_rgba(50,83,71,0.3)]">RH</span>
            Rant & Heal
          </Link>
          <p className="mt-10 text-xs font-medium uppercase tracking-[0.14em] text-[#4a6b5e]/70">Practitioner onboarding</p>
          <h1 className="mt-3 text-4xl font-medium leading-tight tracking-[-0.04em] text-[#325347]">
            Apply to join the therapist directory.
          </h1>
          <p className="mt-5 max-w-lg text-base font-light leading-7 text-[#414845]">
            Your application is reviewed before it appears in the patient directory or gains access to clinical tools.
          </p>
        </section>

        <Card className="p-6 sm:p-8" variant="solid">
          {verificationStatus === TherapistVerificationStatus.PENDING ? (
            <p className="mb-5 rounded-[1.5rem] bg-[#ffe3cd] p-4 text-sm font-light leading-6 text-[#795841]">
              Application pending review. You can update these details while you wait.
            </p>
          ) : verificationStatus === TherapistVerificationStatus.REJECTED ? (
            <p className="mb-5 rounded-[1.5rem] bg-[#ffdad6] p-4 text-sm font-light leading-6 text-[#93000a]">
              Your application needs changes before approval. Update your details and submit again.
            </p>
          ) : verificationStatus === TherapistVerificationStatus.VERIFIED ? (
            <p className="mb-5 rounded-[1.5rem] bg-[#c6ebda] p-4 text-sm font-light leading-6 text-[#2d4d41]">
              Your profile is verified. Contact support to amend published directory information.
            </p>
          ) : null}
          <form className="space-y-5" onSubmit={handleSubmit}>
            <ErrorMessage>{error}</ErrorMessage>

            <div className="space-y-2">
              <Label htmlFor="therapistName" required>
                Name and credentials
              </Label>
              <Input
                id="therapistName"
                onChange={(event) => setName(event.target.value)}
                placeholder="Dr. Maya Rivera, LMFT"
                disabled={isSubmitting || verificationStatus === TherapistVerificationStatus.VERIFIED}
                value={name}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialty" required>
                Specialties
              </Label>
              <Input
                id="specialty"
                onChange={(event) => setSpecialty(event.target.value)}
                placeholder="Anxiety, trauma, relationships"
                disabled={isSubmitting || verificationStatus === TherapistVerificationStatus.VERIFIED}
                value={specialty}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="licenseNo" required>
                License number
              </Label>
              <Input
                id="licenseNo"
                onChange={(event) => setLicenseNo(event.target.value)}
                placeholder="CA LMFT 123456"
                disabled={isSubmitting || verificationStatus === TherapistVerificationStatus.VERIFIED}
                value={licenseNo}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="availability">Availability</Label>
              <Input
                id="availability"
                onChange={(event) => setAvailability(event.target.value)}
                placeholder="Weekdays by appointment"
                disabled={isSubmitting || verificationStatus === TherapistVerificationStatus.VERIFIED}
                value={availability}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" required>
                Directory bio
              </Label>
              <Textarea
                className="bg-[#fff1e8]"
                id="bio"
                onChange={(event) => setBio(event.target.value)}
                placeholder="Share how you support patients and what care with you feels like."
                rows={5}
                disabled={isSubmitting || verificationStatus === TherapistVerificationStatus.VERIFIED}
                value={bio}
              />
            </div>

            <Button
              className="w-full"
              disabled={verificationStatus === TherapistVerificationStatus.VERIFIED}
              isLoading={isSubmitting}
              type="submit"
            >
              {verificationStatus === TherapistVerificationStatus.VERIFIED
                ? "Profile verified"
                : verificationStatus === TherapistVerificationStatus.PENDING
                  ? "Update application"
                  : "Submit application"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
