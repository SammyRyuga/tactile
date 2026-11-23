import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./Theme.tsx";
import { Site } from "./Site.tsx";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "./styles.css";
import "./home.css";
import "./workspace-theme.css";
import "./theme.css";
import "./action-arrow.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root.");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <Site />
    </ThemeProvider>
  </StrictMode>,
);
