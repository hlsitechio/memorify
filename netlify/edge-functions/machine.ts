// netlify/edge-functions/machine.ts — /api/machine/* dispatcher
// Memorify Remote: pairing, daemon relay, kill switch, machine list.
// All logic lives in backend/routes/machines.ts.
import { handleMachineApi } from "../../backend/routes/machines.ts";

export default async (req: Request): Promise<Response> => {
  return await handleMachineApi(req);
};
