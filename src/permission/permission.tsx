import { createRoot } from "react-dom/client";

import { PermissionPage } from "./components/PermissionPage";
import "./permission.css";

createRoot(document.getElementById("root")!).render(<PermissionPage />);
