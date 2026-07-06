// Sad Server 用の別ウィンドウターミナル
// 親ウィンドウ（quiz.js）から window.open で開かれ、クエリパラメータで接続情報を受け取る。
(function () {
  const params = new URLSearchParams(window.location.search);
  const instanceId = params.get("instanceId");
  const scenarioId = params.get("scenarioId") || "";
  // wsPath はクエリで渡された値を優先し、無ければ instanceId から組み立てる
  const wsPath = params.get("wsPath") || (instanceId ? `/ws/${instanceId}` : "");

  const dot = document.getElementById("sad-conn-dot");
  const label = document.getElementById("sad-conn-label");
  const scenarioLabel = document.getElementById("sad-scenario-label");
  const terminalDiv = document.getElementById("sad-terminal");

  if (scenarioId) {
    scenarioLabel.textContent = `シナリオ: ${scenarioId}`;
  }
  if (instanceId) {
    document.title = `Sad Server - ${instanceId}`;
  }

  function setStatus(text, state) {
    if (label) label.textContent = text;
    if (dot) {
      dot.classList.remove("connected", "error");
      if (state) dot.classList.add(state);
    }
  }

  if (!instanceId || !wsPath) {
    setStatus("接続情報が不足しています", "error");
    return;
  }

  const term = new Terminal({
    scrollback: 10000,
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: { background: "#000000", foreground: "#ffffff" },
  });
  term.open(terminalDiv);
  term.focus();
  term.write(`\r\n✅ シナリオ ${scenarioId || instanceId} に接続します\r\n`);
  term.write(`WebSocket: ${wsPath}\r\n`);
  term.write("―".repeat(50) + "\r\n\r\n");

  const currentHost = window.location.hostname;
  const socketUrl = `http://${currentHost}:3333${wsPath}`;
  const socket = io(socketUrl, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    withCredentials: true,
  });

  term.onData((input) => socket.emit("input", input));

  socket.on("output", (data) => {
    term.write(data);
    setTimeout(() => term.scrollToBottom(), 0);
  });

  socket.on("connect", () => {
    setStatus("接続完了", "connected");
    term.write("\r\n🟢 接続完了\r\n\r\n");
    term.focus();
  });

  socket.on("disconnect", () => {
    setStatus("セッション終了", "error");
    term.write("\r\n\r\n[🔴 セッション終了]\r\n");
  });

  socket.on("connect_error", (err) => {
    setStatus(`接続エラー: ${err.message}`, "error");
    term.write(`\r\n❌ 接続エラー: ${err.message}\r\n`);
  });

  // ウィンドウを閉じたら socket を切断（コンテナ自体は親側の Destroy Server で停止）
  window.addEventListener("beforeunload", () => {
    try {
      socket.disconnect();
    } catch (e) {
      /* noop */
    }
  });

  // 親ウィンドウから明示的に切断を指示された場合
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "sad-disconnect") {
      try {
        socket.disconnect();
      } catch (e) {
        /* noop */
      }
    }
  });
})();
