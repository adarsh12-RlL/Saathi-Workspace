import {createMoltbookReadHandler} from "../../../../../../moltbook-bridge.mjs";

// Private pages cannot call this endpoint under their connect-src 'none'.
// This route has no credentials, auth session, vault or workspace dependency.
const read=createMoltbookReadHandler();
export async function POST(request:Request){return read(request);}
