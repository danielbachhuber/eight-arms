import { setupServer } from "msw/node";
import { allHandlers } from "./handlers.js";

export const mockServer = setupServer(...allHandlers);
