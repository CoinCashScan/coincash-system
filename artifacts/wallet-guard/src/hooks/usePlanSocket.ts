import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { SOCKET_URL, SOCKET_PATH } from "@/lib/apiConfig";

export type PlanName = "free" | "pro";

export interface PlanUpdatedPayload {
  ccId: string;
  plan: PlanName;
}

/**
 * Connects to the Socket.io server, joins the user's own room,
 * and calls `onPlanUpdated` whenever the admin changes the user's plan.
 *
 * The socket is torn down when the component unmounts or ccId becomes falsy.
 */
export function usePlanSocket(
  ccId: string | null,
  onPlanUpdated: (payload: PlanUpdatedPayload) => void,
) {
  const socketRef = useRef<Socket | null>(null);
  const cbRef     = useRef(onPlanUpdated);
  cbRef.current   = onPlanUpdated;

  useEffect(() => {
    if (!ccId) return;

    const socket = io(SOCKET_URL, {
      path:       SOCKET_PATH,
      transports: ["websocket", "polling"],
      reconnection:        true,
      reconnectionAttempts: 10,
      reconnectionDelay:   2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("register", ccId);
    });

    socket.on("plan-updated", (data: PlanUpdatedPayload) => {
      if (data.ccId === ccId) {
        cbRef.current(data);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [ccId]);
}
