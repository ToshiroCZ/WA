const ws = new WebSocket("ws://localhost:8080");
const editor = document.getElementById("editor");
const status = document.getElementById("status");
const usersDiv = document.getElementById("users");

const cursorLayer = document.createElement("div");
cursorLayer.id = "cursor-layer";
document.body.appendChild(cursorLayer);

const cursors = {}; // Uchovává pozice kurzorů ostatních uživatelů
const selections = {}; // Uchovává výběry ostatních uživatelů
let userId = null;



// Funkce pro ukládání a načítání z cache
function saveToCache(content) {
  localStorage.setItem("cachedContent", content);
}

function getFromCache() {
  return localStorage.getItem("cachedContent");
}

function clearCache() {
  localStorage.removeItem("cachedContent");
}



// Funkce pro nastavení editoru (povolit/zakázat editaci)
function setEditorEnabled(enabled) {
    editor.disabled = !enabled;
    if (!enabled) {
        editor.value = "Disconnected from server. Editing is disabled.";
    }
}

// Při navázání spojení
ws.onopen = () => {
    status.textContent = "Connected to server.";
    status.style.color = "green";
    setEditorEnabled(true);
    const cachedContent = getFromCache();
if (cachedContent) {
    editor.value = cachedContent;
    ws.send(JSON.stringify({ type: "update", content: cachedContent }));
    clearCache();
}
};

// Při příjmu zpráv
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "init") {
        editor.value = data.content;
        userId = data.userId;
        updateUsers(data.users);
    } else if (data.type === "update") {
        editor.value = data.content;
    } else if (data.type === "cursor") {
        updateCursor(data.userId, data.cursor);
    } else if (data.type === "selection") {
        showSelection(data.userId, data.selection);
    } else if (data.type === "user_disconnect") {
        removeCursor(data.userId);
        removeSelection(data.userId);
        updateUsers(data.users);
    }
};

// Při uzavření spojení
ws.onclose = () => {
    status.textContent = "Disconnected from server.";
    status.style.color = "red";
    setEditorEnabled(true);
    saveToCache(editor.value);
};

// Odesílání změn textu
editor.addEventListener("input", () => {
  const currentValue = editor.value;

  // Uložení změn do cache
  saveToCache(currentValue);

  // Odesílání změn na server, pokud je připojení aktivní
  if (ws && ws.readyState === WebSocket.OPEN) {
      const lastChar = currentValue.slice(-1);
      if (lastChar === " " || lastChar === "\n") {
          ws.send(JSON.stringify({ type: "update", content: currentValue }));
      }
  }
});

editor.addEventListener("mousemove", (event) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const rect = editor.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  ws.send(JSON.stringify({ type: "cursor", cursor: { x, y } }));
});

// Odesílání výběru textu
editor.addEventListener("mouseup", () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;

    if (selectionStart !== selectionEnd) {
        ws.send(JSON.stringify({
            type: "selection",
            selection: { start: selectionStart, end: selectionEnd },
        }));
    }
});

// Zobrazení výběru ostatních uživatelů
function showSelection(userId, selection) {
    let selectionElement = selections[userId];
    if (!selectionElement) {
        selectionElement = document.createElement("div");
        selectionElement.className = "selection-highlight";
        editor.parentNode.appendChild(selectionElement);
        selections[userId] = selectionElement;
    }

    const rect = editor.getBoundingClientRect();
    const lineHeight = 20; // Přizpůsobit výšce řádku v textovém editoru

    selectionElement.style.position = "absolute";
    selectionElement.style.top = `${rect.top + Math.floor(selection.start / editor.cols) * lineHeight}px`;
    selectionElement.style.left = `${rect.left + (selection.start % editor.cols) * 10}px`;
    selectionElement.style.width = `${(selection.end - selection.start) * 10}px`;
    selectionElement.style.height = `${lineHeight}px`;
    selectionElement.style.backgroundColor = "rgba(0, 255, 0, 0.3)";
}

// Odstranění zvýraznění výběru
function removeSelection(userId) {
    if (selections[userId]) {
        selections[userId].remove();
        delete selections[userId];
    }
}
// Zaznamenání pohybu myši pouze v textovém poli
editor.addEventListener("mousemove", (event) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const rect = editor.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
        ws.send(JSON.stringify({ type: "cursor", cursor: { x, y } }));
    }
});

// Aktualizace kurzorů ostatních uživatelů
function updateCursor(userId, cursor) {
    if (!cursors[userId]) {
        const cursorElement = document.createElement("div");
        cursorElement.className = "cursor";
        cursorLayer.appendChild(cursorElement);
        cursors[userId] = cursorElement;
    }
    const rect = editor.getBoundingClientRect();

    // Přepočet souřadnic na celou stránku
    const globalX = rect.left + cursor.x;
    const globalY = rect.top + cursor.y;

    const cursorElement = cursors[userId];
    cursorElement.style.left = `${globalX}px`;
    cursorElement.style.top = `${globalY}px`;
}

// Odstranění kurzoru po odpojení uživatele
function removeCursor(userId) {
    if (cursors[userId]) {
        cursors[userId].remove();
        delete cursors[userId];
    }
}

// Aktualizace seznamu připojených uživatelů
function updateUsers(users) {
    usersDiv.innerHTML = "Connected users:<br>" + users.map(u => `User ${u.id}`).join("<br>");
}


document.addEventListener("mouseup", () => {
  const selection = window.getSelection();
  if (!selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const startOffset = range.startOffset;
      const endOffset = range.endOffset;

      const message = {
          action: "highlight",
          start: startOffset,
          end: endOffset
      };

      socket.send(JSON.stringify(message));
  }
});

// Přijetí dat o označení
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);
  if (data.action === "highlight") {
      const textElement = document.getElementById("text");
      const textContent = textElement.textContent;

      // Znovu vytvoříme obsah se zvýrazněním
      const highlightedText =
          textContent.slice(0, data.start) +
          `<span class="highlight">` +
          textContent.slice(data.start, data.end) +
          `</span>` +
          textContent.slice(data.end);

      textElement.innerHTML = highlightedText;
  }
});


