"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/src/context/AuthContext";

export function useSafetyReviewerAccess() {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ uid: string; allowed: boolean } | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    user.getIdTokenResult(true).then((result) => {
      if (active) setState({
        uid: user.uid,
        allowed: result.claims.safetyReviewer === true || result.claims.admin === true,
      });
    }).catch(() => {
      if (active) setState({ uid: user.uid, allowed: false });
    });
    return () => { active = false; };
  }, [user]);

  return {
    user,
    loading: authLoading || Boolean(user && state?.uid !== user.uid),
    allowed: Boolean(user && state?.uid === user.uid && state.allowed),
  };
}
