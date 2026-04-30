"use client";

import React, { useState, useRef, useEffect } from "react";
import { UserRole } from "@/src/types/database";
import { syncUserProfile } from "@/src/services/userService";
import { createTherapistProfile } from "@/src/services/therapistService";
import { requestConnection } from "@/src/services/connectionService";
import { authService } from "@/src/services/authService";
import { useAuth } from "@/src/context/AuthContext";

export default function SystemTestPage() {
  const { user } = useAuth();
  
  const [lastRegisteredUserUid, setLastRegisteredUserUid] = useState("");
  const [lastRegisteredUserEmail, setLastRegisteredUserEmail] = useState("");
  const [lastRegisteredTherapistUid, setLastRegisteredTherapistUid] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const generateMockEmail = (role: string) => `mock_${role}_${Math.random().toString(36).substring(7)}@test.com`;

  const handleRegisterUser = async () => {
    try {
      addLog("Starting Mock User Registration...");
      const email = generateMockEmail("user");
      const password = "Password123!";
      
      const userCredential = await authService.signUpWithEmail(email, password);
      const uid = userCredential.user.uid;
      addLog(`Auth Account Created | UID: ${uid}`);

      await syncUserProfile(uid, {
        email,
        displayName: "Mock Patient User",
        role: UserRole.USER,
        onboardingComplete: true,
        mfaEnabled: false,
        encryptionKeyHash: ""
      });
      
      addLog(`✅ User Registered: Document Synced`);
      setLastRegisteredUserUid(uid);
      setLastRegisteredUserEmail(email);
    } catch (error: any) {
      console.error(error);
      addLog(`❌ Error: ${error.message}`);
    }
  };

  const handleRegisterTherapist = async () => {
    try {
      addLog("Starting Mock Therapist Registration...");
      const email = generateMockEmail("therapist");
      const password = "Password123!";
      
      const userCredential = await authService.signUpWithEmail(email, password);
      const uid = userCredential.user.uid;
      addLog(`Auth Account Created | UID: ${uid}`);

      await syncUserProfile(uid, {
        email,
        displayName: "Dr. Mock Therapist",
        role: UserRole.THERAPIST,
        onboardingComplete: true,
        mfaEnabled: false,
        encryptionKeyHash: ""
      });

      await createTherapistProfile(uid, {
        name: "Dr. Mock Therapist",
        specialty: "CBT",
        licenseNo: `LIC-${Math.floor(Math.random() * 100000)}`,
        isVerified: true,
        bio: "Mock Bio",
        availability: {}
      });
      
      addLog(`✅ Therapist Registered: Profile Created`);
      setLastRegisteredTherapistUid(uid);
    } catch (error: any) {
      console.error(error);
      addLog(`❌ Error: ${error.message}`);
    }
  };

  const handleLinkToTherapist = async () => {
    if (!lastRegisteredUserUid || !lastRegisteredTherapistUid || !lastRegisteredUserEmail) {
      addLog("❌ Error: Missing last registered User or Therapist UID");
      return;
    }
    
    try {
      addLog(`Initiating Handshake... (Delaying 500ms for Auth token sync)`);
      addLog(`Linking Patient [${lastRegisteredUserUid}] to Therapist [${lastRegisteredTherapistUid}]`);
      
      if (user?.uid !== lastRegisteredUserUid) {
        addLog(`Switching Auth Context to Patient (${lastRegisteredUserEmail})...`);
        await authService.signInWithEmail(lastRegisteredUserEmail, "Password123!");
      }
      
      // Delay to ensure Firebase Auth token is recognized by Firestore rules
      await new Promise((resolve) => setTimeout(resolve, 500));

      const mockConsentHash = `consent_${Math.random().toString(36).substring(7)}`;
      
      await requestConnection(lastRegisteredUserUid, lastRegisteredTherapistUid, mockConsentHash);
      
      addLog(`🔗 Connection Established | Primary Key: ${lastRegisteredUserUid}`);
    } catch (error: any) {
      console.error(error);
      addLog(`❌ Error: ${error.message}`);
    }
  };

  const handleWipeSession = async () => {
    try {
      await authService.signOut();
      addLog("🧹 Session Wiped. Local state cleared.");
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-white p-8 font-mono text-black">
      <div className="max-w-5xl mx-auto space-y-10">
        
        <div className="flex flex-col md:flex-row justify-between items-center border-[2px] border-black bg-white p-6 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
          <h1 className="text-3xl font-bold uppercase tracking-tight">System Testing Dashboard</h1>
          <button
            onClick={handleWipeSession}
            className="mt-4 md:mt-0 border-[2px] border-black bg-white px-6 py-2 font-bold uppercase transition-transform hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none"
          >
            Wipe Session
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Section A */}
          <div className="border-[2px] border-black bg-white p-6 shadow-[4px_4px_0_0_rgba(0,0,0,1)] flex flex-col">
            <h2 className="text-xl font-bold uppercase mb-4 border-b-[2px] border-black pb-2">
              Section A: User Portal
            </h2>
            <div className="mb-6 flex-grow">
              <p className="text-sm font-bold">Status: {user ? "Active" : "No User"}</p>
              <p className="text-sm mt-2 break-all">Current User UID: {lastRegisteredUserUid || "N/A"}</p>
            </div>
            <button
              onClick={handleRegisterUser}
              className="w-full border-[2px] border-black bg-white p-3 font-bold uppercase transition-transform hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none"
            >
              Register Mock User
            </button>
          </div>

          {/* Section B */}
          <div className="border-[2px] border-black bg-white p-6 shadow-[4px_4px_0_0_rgba(0,0,0,1)] flex flex-col">
            <h2 className="text-xl font-bold uppercase mb-4 border-b-[2px] border-black pb-2">
              Section B: Therapist Portal
            </h2>
            <div className="mb-6 flex-grow">
              <p className="text-sm font-bold">Generated Therapist UID:</p>
              <p className="text-sm mt-2 break-all">{lastRegisteredTherapistUid || "None Generated Yet"}</p>
            </div>
            <button
              onClick={handleRegisterTherapist}
              className="w-full border-[2px] border-black bg-white p-3 font-bold uppercase transition-transform hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none"
            >
              Register Mock Therapist
            </button>
          </div>
        </div>

        {/* Section C */}
        <div className="border-[2px] border-black bg-white p-6 shadow-[4px_4px_0_0_rgba(0,0,0,1)] flex flex-col">
          <h2 className="text-xl font-bold uppercase mb-4 border-b-[2px] border-black pb-2">
            Section C: Connection Handshake
          </h2>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-bold uppercase mb-2">Target Therapist UID</label>
              <input 
                type="text" 
                value={lastRegisteredTherapistUid}
                onChange={(e) => setLastRegisteredTherapistUid(e.target.value)}
                className="w-full border-[2px] border-black p-3 font-mono text-sm outline-none focus:shadow-[4px_4px_0_0_rgba(0,0,0,1)] transition-shadow"
                placeholder="Enter Therapist UID..."
              />
            </div>
          </div>
          <button
            onClick={handleLinkToTherapist}
            className="w-full border-[2px] border-black bg-white p-3 font-bold uppercase transition-transform hover:-translate-y-1 hover:shadow-[4px_4px_0_0_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none"
          >
            Link to Therapist
          </button>
        </div>

        {/* Section D */}
        <div className="border-[2px] border-black bg-black p-6 shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
          <div className="flex justify-between items-center mb-4 border-b-[2px] border-[#4ade80] pb-2">
            <h2 className="text-xl font-bold uppercase text-[#4ade80]">
              Section D: Terminal Logs
            </h2>
            <button 
              onClick={() => setLogs([])}
              className="text-xs border-[2px] border-[#4ade80] text-[#4ade80] px-2 py-1 hover:bg-[#4ade80] hover:text-black uppercase font-bold"
            >
              Clear
            </button>
          </div>
          <div className="font-mono text-sm text-[#4ade80] h-64 overflow-y-auto space-y-2">
            {logs.length === 0 && <p className="opacity-50">Awaiting system events...</p>}
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}
