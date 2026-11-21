let preferred;
try {
  preferred = localStorage.getItem("tactile-theme");
} catch {
  // Honor the system preference when storage is unavailable.
}
document.documentElement.dataset.theme =
  preferred === "dark" || preferred === "light"
    ? preferred
    : matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
