const host = window.location.hostname;
const pathParts = window.location.pathname.split("/");

// Dynamic detection of GitHub URL parts
let USER = "tilo-restocafe";
let REPO = "vinos";

if (host.includes(".github.io")) {
    USER = host.split(".")[0];
    REPO = pathParts[1] || "vinos";
}

const FILE_PATH = "sugerencias.json";
const BRANCH = "main";

// Elements
const textarea = document.getElementById("editor");
const btnGuardar = document.getElementById("guardar");
const estado = document.getElementById("estado");
const idiomaSelect = document.getElementById("idiomaSelect");
const nombreLocalInput = document.getElementById("nombreLocal");
const iframe = document.querySelector(".preview iframe");

const tokenInput = document.getElementById("token");
const btnSaveToken = document.getElementById("btnSaveToken");
const btnClearToken = document.getElementById("btnClearToken");
const tokenStatus = document.getElementById("tokenStatus");

let TOKEN = null;
let shaActual = null;
let jsonCompleto = {};

// Safe access to localStorage
function obtenerTokenLocal() {
    try {
        return localStorage.getItem("github_token") || "";
    } catch (e) {
        console.warn("localStorage no disponible:", e);
        return "";
    }
}

function guardarTokenLocal(tok) {
    try {
        localStorage.setItem("github_token", tok);
    } catch (e) {
        console.warn("No se pudo guardar en localStorage:", e);
    }
}

function borrarTokenLocal() {
    try {
        localStorage.removeItem("github_token");
    } catch (e) {
        console.warn("No se pudo borrar de localStorage:", e);
    }
}

// Adjust iframe src (local vs cloud)
function inicializarIframe() {
    if (iframe) {
        const isLocal = host === "localhost" || host === "127.0.0.1" || window.location.protocol === "file:";
        if (isLocal) {
            iframe.src = "../index.html";
        } else {
            iframe.src = `https://${USER}.github.io/${REPO}/`;
        }
    }
}

/* UTF8 ENCODING/DECODING */
function decodeUTF8(base64) {
    return new TextDecoder("utf-8").decode(
        Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    );
}

function encodeUTF8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
}

/* REAL-TIME PREVIEW SYSTEM */
function actualizarVistaPrevia() {
    if (iframe && iframe.contentWindow) {
        const lineas = textarea.value
            .split("\n")
            .map(l => l.trim())
            .filter(l => l.length > 0);

        iframe.contentWindow.postMessage({
            type: "updateSuggestions",
            config: { nombreLocal: nombreLocalInput.value },
            sugerencias: lineas,
            idioma: idiomaSelect.value
        }, "*");
    }
}

/* VALIDATE AND DISPLAY GITHUB TOKEN */
async function validarTokenGitHub() {
    TOKEN = obtenerTokenLocal();
    if (tokenInput) tokenInput.value = TOKEN;

    if (!TOKEN) {
        if (tokenStatus) {
            tokenStatus.textContent = "❌ Sin Token (Solo Lectura)";
            tokenStatus.style.color = "#c48d49";
        }
        return;
    }

    if (tokenStatus) {
        tokenStatus.textContent = "Validando...";
        tokenStatus.style.color = "#c48d49";
    }

    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `token ${TOKEN}` }
        });

        if (res.ok) {
            const data = await res.json();
            if (tokenStatus) {
                tokenStatus.textContent = `✅ Activo: ${data.login}`;
                tokenStatus.style.color = "#4a773c";
            }
        } else {
            if (tokenStatus) {
                tokenStatus.textContent = "⚠️ Token Vencido o Inválido";
                tokenStatus.style.color = "#b03a2e";
            }
        }
    } catch (e) {
        if (tokenStatus) {
            tokenStatus.textContent = "Error al conectar API";
            tokenStatus.style.color = "#b03a2e";
        }
    }
}

/* CARGAR SUGERENCIAS */
async function cargarJSON() {
    estado.textContent = "Cargando sugerencias...";

    // Obtener desde la API de GitHub
    const url = `https://api.github.com/repos/${USER}/${REPO}/contents/${FILE_PATH}?t=${Date.now()}`;
    const token = obtenerTokenLocal();

    const headers = {};
    if (token) headers.Authorization = `token ${token}`;

    try {
        const res = await fetch(url, { headers });

        if (!res.ok) throw new Error("No se pudo conectar a GitHub o el archivo no existe");

        const data = await res.json();
        shaActual = data.sha;

        jsonCompleto = JSON.parse(decodeUTF8(data.content));

        nombreLocalInput.value = jsonCompleto.config?.nombreLocal || "";
        mostrarIdioma();

        estado.textContent = "Cargado con éxito ✅";
        estado.style.color = "#4a773c";

        // Carga inicial en la vista previa
        setTimeout(actualizarVistaPrevia, 800);
    } catch (e) {
        console.error(e);
        estado.textContent = "Error al cargar sugerencias ❌";
        estado.style.color = "#b03a2e";

        // Intentar cargar localmente si falla la API (por ejemplo, si no hay token o internet)
        try {
            const localRes = await fetch(`../${FILE_PATH}?t=${Date.now()}`);
            if (localRes.ok) {
                jsonCompleto = await localRes.json();
                nombreLocalInput.value = jsonCompleto.config?.nombreLocal || "";
                mostrarIdioma();
                estado.textContent = "Cargado offline (Solo Lectura) 🔌";
                estado.style.color = "#c48d49";
                setTimeout(actualizarVistaPrevia, 800);
            }
        } catch (localErr) {
            console.error("Fallo carga offline:", localErr);
        }
    }
}

/* AUTOMATIC TEXTAREA RESIZING */
function autoResizeTextarea() {
    textarea.style.height = "auto";
    textarea.style.height = (textarea.scrollHeight + 4) + "px";
}

/* MOSTRAR SUGERENCIAS DEL IDIOMA SELECCIONADO */
function mostrarIdioma() {
    const idioma = idiomaSelect.value;
    const lista = jsonCompleto[idioma] || [];
    textarea.value = lista.join("\n");
    autoResizeTextarea();
}

async function translateText(text, fromLang, toLang) {
    if (!text) return "";
    try {
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromLang}|${toLang}`);
        if (res.ok) {
            const data = await res.json();
            if (data.responseData && data.responseData.translatedText) {
                return data.responseData.translatedText;
            }
        }
    } catch (e) {
        console.error("Error translating:", e);
    }
    return text; // fallback
}

async function autoTraducirSugerencias() {
    const sourceLang = idiomaSelect.value;
    const lineas = textarea.value
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (lineas.length === 0) {
        alert("Escribe primero las sugerencias en el editor para poder traducir.");
        return;
    }

    estado.textContent = "Traduciendo sugerencias con IA...";
    estado.style.color = "#c48d49";

    const targetLangs = ['es', 'en', 'pt'].filter(l => l !== sourceLang);
    const translations = {};

    try {
        for (const tLang of targetLangs) {
            translations[tLang] = await Promise.all(
                lineas.map(line => translateText(line, sourceLang, tLang))
            );
        }

        // Guardar las traducciones en memoria
        jsonCompleto[sourceLang] = lineas;
        for (const tLang of targetLangs) {
            jsonCompleto[tLang] = translations[tLang];
        }

        estado.textContent = "¡Traducciones automáticas completadas! (Guarda cambios) ✅";
        estado.style.color = "#4a773c";

        // Forzar actualización en tiempo real en el iframe
        actualizarVistaPrevia();
    } catch (e) {
        console.error("Error translating suggestions:", e);
        estado.textContent = "Error en el servicio de traducción ❌";
        estado.style.color = "#b03a2e";
    }
}

/* GUARDAR SUGERENCIAS EN GITHUB */
async function guardarJSON() {
    const token = obtenerTokenLocal();
    if (!token) {
        alert("Introduce y guarda tu token de GitHub para poder guardar cambios en la nube.");
        return;
    }

    const idioma = idiomaSelect.value;
    const lineas = textarea.value
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);

    jsonCompleto[idioma] = lineas;
    jsonCompleto.config = {
        ...jsonCompleto.config,
        nombreLocal: nombreLocalInput.value
    };

    estado.textContent = "Sincronizando cambios con GitHub...";
    estado.style.color = "#c48d49";

    const contenidoBase64 = encodeUTF8(
        JSON.stringify(jsonCompleto, null, 2)
    );

    const url = `https://api.github.com/repos/${USER}/${REPO}/contents/${FILE_PATH}`;

    try {
        // 1. Obtener dinámicamente el SHA más reciente del archivo en GitHub para evitar conflictos de sobrescritura
        let sha = shaActual;
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const resInfo = await fetch(`${url}${cacheBuster}`, {
                headers: { Authorization: `token ${token}` }
            });
            if (resInfo.ok) {
                const data = await resInfo.json();
                sha = data.sha;
                shaActual = sha; // Actualizar globalmente
            }
        } catch (errSha) {
            console.warn("No se pudo obtener el SHA más reciente de GitHub:", errSha);
        }

        // 2. Realizar la escritura (PUT) con el SHA correcto
        const res = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `token ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: `Actualización de sugerencias Mozo Digital (${idioma.toUpperCase()})`,
                content: contenidoBase64,
                sha: sha,
                branch: BRANCH
            })
        });

        if (res.ok) {
            const resData = await res.json();
            shaActual = resData.content.sha; // Actualizar SHA actual para la próxima guardada
            estado.textContent = "Sugerencias guardadas en la nube ✅";
            estado.style.color = "#4a773c";

            // Forzar actualización en tiempo real en el iframe
            actualizarVistaPrevia();
            alert("¡Cambios guardados con éxito en la nube! ✅");
        } else {
            const errInfo = await res.text();
            throw new Error(`Código ${res.status}: ${errInfo}`);
        }
    } catch (e) {
        console.error(e);
        estado.textContent = "Error al guardar sugerencias ❌";
        estado.style.color = "#b03a2e";
        alert("Hubo un error al guardar los cambios en la nube: " + e.message);
    }
}

// Configurar Token
if (btnSaveToken) {
    btnSaveToken.addEventListener("click", () => {
        const val = tokenInput.value.trim();
        guardarTokenLocal(val);
        validarTokenGitHub();
        cargarJSON();
    });
}

if (btnClearToken) {
    btnClearToken.addEventListener("click", () => {
        borrarTokenLocal();
        validarTokenGitHub();
        if (tokenInput) tokenInput.value = "";
        location.reload();
    });
}

if (btnGuardar) {
    btnGuardar.addEventListener("click", guardarJSON);
}

const btnTraducir = document.getElementById("btnTraducir");
if (btnTraducir) {
    btnTraducir.addEventListener("click", autoTraducirSugerencias);
}

// Local state saving to keep all languages in memory synchronized
function guardarEstadoLocal() {
    const idioma = idiomaSelect.value;
    const lineas = textarea.value
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);
    jsonCompleto[idioma] = lineas;
    if (!jsonCompleto.config) jsonCompleto.config = {};
    jsonCompleto.config.nombreLocal = nombreLocalInput.value;
}

// GitHub Token Protection / Security Lock
const ADMIN_CODE = "aguero2026";

function toggleAdminLock() {
    const group = document.getElementById('tokenControlGroup');
    const btn = document.getElementById('btnLockAdmin');
    if (!group || !btn) return;

    if (group.style.display === 'flex') {
        group.style.display = 'none';
        btn.innerHTML = '🔒 Acceso Propietario';
        sessionStorage.removeItem('admin_unlocked');
        estado.textContent = "Acceso propietario cerrado 🔒";
        estado.style.color = "#c48d49";
    } else {
        if (sessionStorage.getItem('admin_unlocked') === 'true') {
            group.style.display = 'flex';
            btn.innerHTML = '🔓 Propietario Activo';
            return;
        }
        const code = prompt("Ingresa el código de seguridad para gestionar el Token:");
        if (code === ADMIN_CODE) {
            group.style.display = 'flex';
            btn.innerHTML = '🔓 Propietario Activo';
            sessionStorage.setItem('admin_unlocked', 'true');
            estado.textContent = "Acceso propietario concedido 🔓";
            estado.style.color = "#4a773c";
        } else if (code !== null) {
            alert("Código incorrecto");
        }
    }
}

// Automatically restore owner panel view if unlocked in session
function restaurarBloqueoAdmin() {
    const group = document.getElementById('tokenControlGroup');
    const btn = document.getElementById('btnLockAdmin');
    if (group && btn && sessionStorage.getItem('admin_unlocked') === 'true') {
        group.style.display = 'flex';
        btn.innerHTML = '🔓 Propietario Activo';
    }
}

// Expose globally for HTML onclick inline handling
window.toggleAdminLock = toggleAdminLock;

// Live preview binding
nombreLocalInput.addEventListener("input", () => {
    guardarEstadoLocal();
    actualizarVistaPrevia();
});
textarea.addEventListener("input", () => {
    autoResizeTextarea();
    guardarEstadoLocal();
    actualizarVistaPrevia();
});
idiomaSelect.addEventListener("change", () => {
    mostrarIdioma();
    actualizarVistaPrevia();
});

// Emoji button insert
document.querySelectorAll(".emoji-list button").forEach(btn => {
    btn.addEventListener("click", () => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const emoji = btn.textContent;

        textarea.value =
            textarea.value.substring(0, start) +
            emoji +
            textarea.value.substring(end);

        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length;

        // Trigger live preview update
        autoResizeTextarea();
        guardarEstadoLocal();
        actualizarVistaPrevia();
    });
});

// Escuchar si el iframe de vista previa se ha cargado de nuevo
window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "previewReady") {
        actualizarVistaPrevia();
    }
});

/* INICIAR */
async function iniciar() {
    inicializarIframe();
    restaurarBloqueoAdmin();
    await validarTokenGitHub();
    await cargarJSON();
}

iniciar();
