"use strict";

// Retrouve le vrai dossier Bureau de la session, quel que soit l'OS et la
// langue du systeme. Le nom physique du dossier ne vaut rien: sous Windows,
// un compte francais peut avoir son Bureau deplace vers OneDrive sous un nom
// localise ("Bureau"), et sous Linux le dossier depend des user dirs. Seul le
// systeme connait la reponse, on lui pose donc la question.
//
// Dans l'application Electron, le process principal passe le chemin exact que
// renvoie app.getPath('desktop'). Ce module sert de repli quand on tourne sans
// Electron (serveur standalone, developpement dans un navigateur).

const os = require("os");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

let cache = null;

function desktopParDefaut() {
  return path.join(os.homedir(), "Desktop");
}

// Windows: [Environment]::GetFolderPath repond avec le dossier reelement
// utilise par la session, y compris apres une redirection OneDrive ou vers un
// dossier a nom localise. Pas de registre a lire a la main, pas de "Desktop"
// suppose.
function bureauWindows() {
  try {
    const sortie = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Environment]::GetFolderPath('Desktop')"
      ],
      { encoding: "utf8", timeout: 8000, windowsHide: true }
    ).trim();
    if (sortie && fs.existsSync(sortie)) {
      return sortie;
    }
  } catch (_) {}
  return desktopParDefaut();
}

// Linux: xdg-user-dir connait la traduction, sinon on lit user-dirs.dirs.
function bureauLinux() {
  try {
    const sortie = execFileSync("xdg-user-dir", ["DESKTOP"], {
      encoding: "utf8",
      timeout: 4000
    }).trim();
    if (sortie && path.isAbsolute(sortie)) {
      return sortie;
    }
  } catch (_) {}
  try {
    const config = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    const texte = fs.readFileSync(path.join(config, "user-dirs.dirs"), "utf8");
    const trouve = texte.match(/^XDG_DESKTOP_DIR\s*=\s*"?([^"\n]+)"?/m);
    if (trouve) {
      let dir = trouve[1].replace(/\$HOME/g, os.homedir());
      if (dir.startsWith("~/")) {
        dir = path.join(os.homedir(), dir.slice(2));
      }
      if (fs.existsSync(dir)) {
        return dir;
      }
    }
  } catch (_) {}
  return desktopParDefaut();
}

function resolveDesktopDir() {
  if (cache) {
    return cache;
  }
  let dir;
  if (process.platform === "win32") {
    dir = bureauWindows();
  } else if (process.platform === "darwin") {
    dir = desktopParDefaut();
  } else {
    dir = bureauLinux();
  }
  cache = dir;
  return dir;
}

module.exports = { resolveDesktopDir };
