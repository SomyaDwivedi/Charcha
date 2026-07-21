"use strict";

// ==========================================
// 1. SIGNALR INITIALIZATION
// ==========================================
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/chathub")
    .build();

// ==========================================
// 2. TEXT CHAT LOGIC
// ==========================================
const sendButton = document.getElementById("sendButton");
const messageInput = document.getElementById("messageInput");
const messagesList = document.getElementById("messagesList");
const chatWindow = document.getElementById("chatWindow");
const usersList = document.getElementById("usersList");
const globalChatTab = document.getElementById("globalChatTab");
const activeChatTitle = document.getElementById("activeChatTitle");
const activeChatLabel = document.getElementById("activeChatLabel");
const videoCallButton = document.getElementById("videoCallButton");
const videoCallModalElement = document.getElementById("videoCallModal");
const incomingCallModalElement = document.getElementById("incomingCallModal");
const usernameModalElement = document.getElementById("usernameModal");
const usernameModalInput = document.getElementById("usernameModalInput");
const usernameModalError = document.getElementById("usernameModalError");
const saveUsernameButton = document.getElementById("saveUsernameButton");

const chatHistoryPageSize = 50;
const userNameStorageKey = "charcha.userName";

sendButton.disabled = true;

let selectedChatId = "global";
let selectedChatName = "Global Chat";
let currentConnectionId;
let currentUserName = "";
let connectedUsers = [];
let hasRegisteredUser = false;
let usernameModal;
let videoCallModal;
let incomingCallModal;
let startCallAfterRegistration = false;
let oldestGlobalMessageId;
let isLoadingOlderMessages = false;
let hasOlderGlobalMessages = true;
const conversationMessages = new Map();
const unreadMessageCounts = new Map();
conversationMessages.set("global", []);

function formatMessageTime(createdAt) {
    if (!createdAt) {
        return "";
    }

    const date = new Date(createdAt);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function createMessageElement(user, message, createdAt, isPrivate) {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    const lineBreak = document.createElement("br");
    const time = document.createElement("time");
    const formattedTime = formatMessageTime(createdAt);

    li.classList.add("chat-message");
    name.textContent = user || "Anonymous";
    li.appendChild(name);

    if (isPrivate) {
        const privateBadge = document.createElement("span");
        privateBadge.classList.add("chat-private-badge");
        privateBadge.textContent = "Private";
        li.appendChild(privateBadge);
    }

    li.appendChild(lineBreak);
    li.appendChild(document.createTextNode(message || ""));

    if (formattedTime) {
        const messageDate = new Date(createdAt);

        time.classList.add("chat-time");
        time.dateTime = messageDate.toISOString();
        time.title = messageDate.toLocaleString();
        time.textContent = formattedTime;
        li.appendChild(document.createElement("br"));
        li.appendChild(time);
    }

    return li;
}

function scrollToLatestMessage() {
    window.requestAnimationFrame(function () {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

function renderMessage(user, message, createdAt, isPrivate, scrollToLatest = true) {
    messagesList.appendChild(createMessageElement(user, message, createdAt, isPrivate));

    if (scrollToLatest) {
        scrollToLatestMessage();
    }
}

function addConversationMessage(chatId, user, message, createdAt, isPrivate, id) {
    if (!conversationMessages.has(chatId)) {
        conversationMessages.set(chatId, []);
    }

    conversationMessages.get(chatId).push({
        user,
        message,
        createdAt,
        isPrivate,
        id
    });
}

function renderSelectedConversation(scrollToLatest = true) {
    const messages = conversationMessages.get(selectedChatId) || [];
    messagesList.innerHTML = "";

    messages.forEach(item => {
        renderMessage(item.user, item.message, item.createdAt, item.isPrivate, false);
    });

    if (scrollToLatest) {
        scrollToLatestMessage();
    }
}

function selectChat(chatId, chatName) {
    selectedChatId = chatId;
    selectedChatName = chatName;
    unreadMessageCounts.delete(chatId);
    activeChatTitle.textContent = chatName;
    activeChatLabel.textContent = chatName;
    videoCallButton.classList.toggle("d-none", chatId === "global");
    renderUsersList();
    renderSelectedConversation();
    setCallButtons(Boolean(peerConnection));
}

function getUnreadMessageCount(chatId) {
    return unreadMessageCounts.get(chatId) || 0;
}

function addUnreadMessage(chatId) {
    unreadMessageCounts.set(chatId, getUnreadMessageCount(chatId) + 1);
}

function getRememberedUserName() {
    try {
        return (window.localStorage.getItem(userNameStorageKey) || "").trim();
    } catch (error) {
        return "";
    }
}

function rememberUserName(name) {
    try {
        window.localStorage.setItem(userNameStorageKey, name);
    } catch (error) {
        console.warn("Unable to remember the user name.", error);
    }
}

function normalizeHistoryMessage(item) {
    return {
        id: item.id ?? item.Id,
        user: item.user ?? item.User,
        message: item.message ?? item.Message,
        createdAt: item.createdAt ?? item.CreatedAt,
        isPrivate: false
    };
}

async function loadLatestChatHistory() {
    const messages = await connection.invoke("GetChatHistory", null, chatHistoryPageSize);
    const historyMessages = messages.map(normalizeHistoryMessage);

    conversationMessages.set("global", historyMessages);
    oldestGlobalMessageId = historyMessages[0]?.id;
    hasOlderGlobalMessages = historyMessages.length === chatHistoryPageSize;

    if (selectedChatId === "global") {
        renderSelectedConversation();
    }
}

async function loadOlderChatHistory() {
    if (
        isLoadingOlderMessages ||
        !hasOlderGlobalMessages ||
        !oldestGlobalMessageId ||
        selectedChatId !== "global"
    ) {
        return;
    }

    isLoadingOlderMessages = true;
    const previousScrollHeight = chatWindow.scrollHeight;
    const previousScrollTop = chatWindow.scrollTop;

    try {
        const messages = await connection.invoke(
            "GetChatHistory",
            oldestGlobalMessageId,
            chatHistoryPageSize);
        const olderMessages = messages.map(normalizeHistoryMessage);

        if (olderMessages.length === 0) {
            hasOlderGlobalMessages = false;
            return;
        }

        const currentMessages = conversationMessages.get("global") || [];
        conversationMessages.set("global", olderMessages.concat(currentMessages));
        oldestGlobalMessageId = olderMessages[0].id;
        hasOlderGlobalMessages = olderMessages.length === chatHistoryPageSize;

        renderSelectedConversation(false);
        window.requestAnimationFrame(function () {
            chatWindow.scrollTop = previousScrollTop + chatWindow.scrollHeight - previousScrollHeight;
        });
    } finally {
        isLoadingOlderMessages = false;
    }
}

function renderUsersList() {
    usersList.innerHTML = "";
    globalChatTab.classList.toggle("active", selectedChatId === "global");

    if (connectedUsers.filter(user => user.connectionId !== currentConnectionId).length === 0) {
        const emptyState = document.createElement("div");
        emptyState.classList.add("chat-empty-users");
        emptyState.textContent = "No other users online";
        usersList.appendChild(emptyState);
        return;
    }

    connectedUsers
        .filter(user => user.connectionId !== currentConnectionId)
        .forEach(user => {
            const button = document.createElement("button");
            const name = document.createElement("span");

            button.type = "button";
            button.classList.add("chat-tab");
            button.dataset.chatId = user.connectionId;
            button.classList.toggle("active", selectedChatId === user.connectionId);

            name.textContent = user.name || "Anonymous";
            button.appendChild(name);

            const unreadCount = getUnreadMessageCount(user.connectionId);

            if (unreadCount > 0) {
                const unread = document.createElement("span");
                unread.classList.add("chat-unread");
                unread.textContent = unreadCount > 99 ? "99+" : unreadCount.toString();
                unread.title = `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`;
                unread.setAttribute("aria-label", unread.title);
                button.appendChild(unread);
            }

            button.addEventListener("click", function () {
                selectChat(user.connectionId, user.name || "Anonymous");
            });

            usersList.appendChild(button);
        });
}

async function registerCurrentUser() {
    const name = currentUserName.trim();

    if (connection.state !== signalR.HubConnectionState.Connected || !name) {
        return;
    }

    await connection.invoke("RegisterUser", name);
    hasRegisteredUser = true;
}

async function saveUsername() {
    const name = usernameModalInput.value.trim();

    if (!name) {
        usernameModalError.classList.remove("d-none");
        usernameModalInput.focus();
        return;
    }

    usernameModalError.classList.add("d-none");
    currentUserName = name;
    await registerCurrentUser();
    rememberUserName(name);
    usernameModal.hide();

    sendButton.disabled = false;

    if (startCallAfterRegistration) {
        startCallAfterRegistration = false;
        startPrivateCall().catch(err => console.error(err));
    }
}

function showUsernameModal() {
    usernameModal = new bootstrap.Modal(usernameModalElement, {
        backdrop: "static",
        keyboard: false
    });

    usernameModal.show();
    usernameModalElement.addEventListener("shown.bs.modal", function () {
        usernameModalInput.focus();
    }, { once: true });
}

function showVideoCallModal() {
    if (!videoCallModal) {
        videoCallModal = new bootstrap.Modal(videoCallModalElement, {
            backdrop: "static",
            keyboard: false
        });
    }

    videoCallModal.show();
}

async function restoreRememberedUser() {
    const rememberedName = getRememberedUserName();

    if (!rememberedName) {
        showUsernameModal();
        return;
    }

    currentUserName = rememberedName;
    usernameModalInput.value = rememberedName;

    try {
        await registerCurrentUser();
        sendButton.disabled = false;
    } catch (error) {
        console.error("Unable to restore the remembered user.", error);
        currentUserName = "";
        showUsernameModal();
    }
}

// Listen for incoming text messages
connection.on("ReceiveMessage", function (user, message, createdAt) {
    addConversationMessage("global", user, message, createdAt, false);

    if (selectedChatId === "global") {
        renderMessage(user, message, createdAt, false);
    }
});

connection.on("ReceivePrivateMessage", function (senderConnectionId, user, message, createdAt) {
    addConversationMessage(senderConnectionId, user, message, createdAt, true);

    if (selectedChatId === senderConnectionId) {
        renderMessage(user, message, createdAt, true);
        return;
    }

    addUnreadMessage(senderConnectionId);
    renderUsersList();
});

connection.on("ReceiveUserList", function (users) {
    connectedUsers = users.map(user => ({
        connectionId: user.connectionId ?? user.ConnectionId,
        name: user.name ?? user.Name
    }));

    if (
        selectedChatId !== "global" &&
        !connectedUsers.some(user => user.connectionId === selectedChatId)
    ) {
        selectChat("global", "Global Chat");
        return;
    }

    renderUsersList();
});

// Handle sending text messages
sendButton.addEventListener("click", function (event) {
    const user = currentUserName.trim();
    const message = messageInput.value;

    if (!hasRegisteredUser || !user) {
        showUsernameModal();
        event.preventDefault();
        return;
    }

    if (message.trim() === "") return;

    registerCurrentUser().catch(function (err) {
        return console.error(err.toString());
    });

    if (selectedChatId === "global") {
        connection.invoke("SendMessage", user, message).catch(function (err) {
            return console.error(err.toString());
        });
    } else {
        const sentAt = new Date().toISOString();

        addConversationMessage(selectedChatId, user, message, sentAt, true);
        renderMessage(user, message, sentAt, true);

        connection.invoke("SendPrivateMessage", selectedChatId, user, message).catch(function (err) {
            return console.error(err.toString());
        });
    }

    messageInput.value = "";
    event.preventDefault();
});

messageInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendButton.click();
    }
});

globalChatTab.addEventListener("click", function () {
    selectChat("global", "Global Chat");
});

videoCallButton.addEventListener("click", function () {
    if (selectedChatId === "global") {
        return;
    }

    if (!hasRegisteredUser) {
        startCallAfterRegistration = true;
        showUsernameModal();
        return;
    }

    startPrivateCall().catch(err => console.error(err));
});

chatWindow.addEventListener("scroll", function () {
    if (chatWindow.scrollTop > 20) {
        return;
    }

    loadOlderChatHistory().catch(function (err) {
        return console.error(err.toString());
    });
});

saveUsernameButton.addEventListener("click", function () {
    saveUsername().catch(function (err) {
        return console.error(err.toString());
    });
});

usernameModalInput.addEventListener("input", function () {
    usernameModalError.classList.add("d-none");
});

usernameModalInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        saveUsernameButton.click();
    }
});

// ==========================================
// 3. WEBRTC VIDEO CALL LOGIC
// ==========================================
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const muteButton = document.getElementById("muteButton");
const cameraButton = document.getElementById("cameraButton");
const endCallButton = document.getElementById("endCallButton");
const acceptCallButton = document.getElementById("acceptCallButton");
const rejectCallButton = document.getElementById("rejectCallButton");
const incomingCallerName = document.getElementById("incomingCallerName");
const incomingCallStatus = document.getElementById("incomingCallStatus");
const callStatus = document.getElementById("callStatus");

let localStream;
let peerConnection;
let remoteConnectionId;
let pendingOfferString;
let pendingCallerId;
let pendingCallerName;
let isAudioMuted = false;
let isCameraOff = false;
let queuedIceCandidates = [];

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

function setCallStatus(message) {
    callStatus.textContent = message;
}

function showIncomingCallModal(callerName) {
    if (!incomingCallModal) {
        incomingCallModal = new bootstrap.Modal(incomingCallModalElement, {
            backdrop: "static",
            keyboard: false
        });
    }

    incomingCallerName.textContent = callerName;
    incomingCallStatus.textContent = "Join to turn on your camera and microphone.";
    incomingCallModal.show();
}

function updateMediaButtons() {
    const hasLocalStream = Boolean(localStream);

    muteButton.disabled = !hasLocalStream;
    cameraButton.disabled = !hasLocalStream;
    muteButton.textContent = isAudioMuted ? "Unmute" : "Mute";
    cameraButton.textContent = isCameraOff ? "Camera On" : "Camera Off";
}

function setCallButtons(isInCall) {
    endCallButton.disabled = !isInCall;
    updateMediaButtons();
}

// Start the camera
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        setCallStatus("Ready to call");
        setCallButtons(false);
    } catch (error) {
        setCallStatus("Camera or microphone access is blocked");
        console.error("Error accessing media devices. Make sure you are on HTTPS!", error);
    }
}

// Setup the P2P Connection
function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && remoteConnectionId) {
            connection.invoke("SendIceCandidate", JSON.stringify(event.candidate), remoteConnectionId);
        }
    };

    peerConnection.onconnectionstatechange = (event) => {
        const activeConnection = event.currentTarget;

        if (activeConnection !== peerConnection) {
            return;
        }

        if (activeConnection.connectionState === "connected") {
            setCallStatus("In call");
            setCallButtons(true);
        }

        if (["closed", "disconnected", "failed"].includes(activeConnection.connectionState)) {
            setCallStatus("Call ended");
            setCallButtons(false);
        }
    };
}

async function addQueuedIceCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) {
        return;
    }

    for (const candidateString of queuedIceCandidates) {
        const candidate = JSON.parse(candidateString);
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    queuedIceCandidates = [];
}

async function addIceCandidate(candidateString, senderId) {
    if (senderId && !remoteConnectionId) {
        remoteConnectionId = senderId;
    }

    if (!peerConnection || !peerConnection.remoteDescription) {
        queuedIceCandidates.push(candidateString);
        return;
    }

    const candidate = JSON.parse(candidateString);
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
}

function clearIncomingCall(afterHidden) {
    pendingOfferString = undefined;
    pendingCallerId = undefined;
    pendingCallerName = undefined;

    if (incomingCallModal && incomingCallModalElement.classList.contains("show")) {
        if (afterHidden) {
            incomingCallModalElement.addEventListener("hidden.bs.modal", afterHidden, { once: true });
        }

        incomingCallModal.hide();
        return;
    }

    afterHidden?.();
}

function resetCall(notifyRemote) {
    if (notifyRemote && remoteConnectionId) {
        connection.invoke("SendEndCall", remoteConnectionId).catch(err => console.error(err));
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = undefined;
    }

    remoteVideo.srcObject = null;
    remoteConnectionId = undefined;
    queuedIceCandidates = [];
    clearIncomingCall();
    setCallStatus("Ready to call");
    setCallButtons(false);
}

// Initiate a private call as soon as the caller presses Video Call.
async function startPrivateCall() {
    if (selectedChatId === "global" || peerConnection || pendingOfferString) {
        return;
    }

    const targetConnectionId = selectedChatId;
    const targetUser = connectedUsers.find(user => user.connectionId === targetConnectionId);

    if (!targetUser) {
        setCallStatus("This user is no longer online");
        setCallButtons(false);
        return;
    }

    showVideoCallModal();

    if (!localStream) {
        await startLocalStream();
    }

    if (!localStream) {
        return;
    }

    remoteConnectionId = targetConnectionId;
    createPeerConnection();
    setCallStatus(`Ringing ${targetUser.name || "this user"}...`);
    setCallButtons(true);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await connection.invoke(
        "SendOffer",
        JSON.stringify(offer),
        targetConnectionId
    );
}

// Receive Call Offer
connection.on("ReceiveOffer", function (offerString, callerId) {
    if (peerConnection || pendingCallerId) {
        connection.invoke("RejectCall", callerId).catch(err => console.error(err));
        return;
    }

    remoteConnectionId = callerId;
    pendingOfferString = offerString;
    pendingCallerId = callerId;
    const caller = connectedUsers.find(user => user.connectionId === callerId);
    pendingCallerName = caller?.name || "Someone";

    if (caller) {
        selectChat(caller.connectionId, caller.name || "Anonymous");
    }

    setCallStatus(`${pendingCallerName} is calling`);
    setCallButtons(false);
    showIncomingCallModal(pendingCallerName);
});

acceptCallButton.addEventListener("click", async () => {
    if (!pendingOfferString || !pendingCallerId) {
        return;
    }

    const offerString = pendingOfferString;
    const callerId = pendingCallerId;

    if (!localStream) {
        await startLocalStream();
    }

    if (!localStream) {
        incomingCallStatus.textContent = "Camera and microphone access is needed to join this call.";
        setCallStatus("Camera or microphone access is blocked");
        return;
    }

    createPeerConnection();
    setCallStatus("Connecting...");
    setCallButtons(true);

    const offer = JSON.parse(offerString);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await connection.invoke("SendAnswer", JSON.stringify(answer), callerId);
    await addQueuedIceCandidates();
    clearIncomingCall(function () {
        showVideoCallModal();
    });
});

rejectCallButton.addEventListener("click", function () {
    if (pendingCallerId) {
        connection.invoke("RejectCall", pendingCallerId).catch(err => console.error(err));
    }

    clearIncomingCall();
    setCallStatus("Ready to call");
    setCallButtons(false);
});

// Receive Call Answer
connection.on("ReceiveAnswer", async (answerString, answererId) => {
    if (!peerConnection || answererId !== remoteConnectionId) {
        return;
    }

    remoteConnectionId = answererId;
    const answer = JSON.parse(answerString);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    await addQueuedIceCandidates();
    setCallStatus("In call");
    setCallButtons(true);
});

// Receive Network Routing Info
connection.on("ReceiveIceCandidate", async (candidateString, senderId) => {
    if (!senderId || senderId !== remoteConnectionId) {
        return;
    }

    await addIceCandidate(candidateString, senderId);
});

connection.on("ReceiveEndCall", function (senderId) {
    if (senderId !== remoteConnectionId) {
        return;
    }

    resetCall(false);
    setCallStatus("Call ended");
    videoCallModal?.hide();
});

connection.on("CallRejected", function (senderId) {
    if (senderId !== remoteConnectionId) {
        return;
    }

    resetCall(false);
    setCallStatus("Call rejected");
    videoCallModal?.hide();
});

muteButton.addEventListener("click", function () {
    if (!localStream) {
        return;
    }

    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isAudioMuted;
    });
    updateMediaButtons();
});

cameraButton.addEventListener("click", function () {
    if (!localStream) {
        return;
    }

    isCameraOff = !isCameraOff;
    localStream.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOff;
    });
    updateMediaButtons();
});

endCallButton.addEventListener("click", function () {
    resetCall(true);
    videoCallModal?.hide();
});

videoCallModalElement.addEventListener("hidden.bs.modal", function () {
    if (pendingCallerId) {
        connection.invoke("RejectCall", pendingCallerId).catch(err => console.error(err));
        clearIncomingCall();
        setCallStatus("Ready to call");
        setCallButtons(false);
        return;
    }

    if (peerConnection) {
        resetCall(true);
    }
});

// ==========================================
// 4. START THE ENGINE
// ==========================================
connection.start().then(function () {
    currentConnectionId = connection.connectionId;

    console.log("Connected to Charcha Hub");
    restoreRememberedUser().catch(function (err) {
        return console.error(err.toString());
    });

    connection.invoke("GetConnectedUsers").then(function (users) {
        connectedUsers = users.map(user => ({
            connectionId: user.connectionId ?? user.ConnectionId,
            name: user.name ?? user.Name
        }));
        renderUsersList();
    }).catch(function (err) {
        return console.error(err.toString());
    });

    loadLatestChatHistory().catch(function (err) {
        return console.error(err.toString());
    });
}).catch(function (err) {
    return console.error("SignalR Connection Error: ", err.toString());
});
