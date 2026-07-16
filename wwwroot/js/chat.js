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
const userInput = document.getElementById("userInput");
const messagesList = document.getElementById("messagesList");
const chatWindow = document.getElementById("chatWindow");

sendButton.disabled = true;

// Listen for incoming text messages
connection.on("ReceiveMessage", function (user, message) {
    const li = document.createElement("li");
    li.style.backgroundColor = "#FFFFFF";
    li.style.padding = "8px 12px";
    li.style.borderRadius = "8px";
    li.style.maxWidth = "80%";
    li.style.width = "fit-content";
    li.style.boxShadow = "0 1px 1px rgba(0,0,0,0.1)";
    li.style.marginBottom = "8px";

    li.innerHTML = `<strong>${user}</strong><br/>${message}`;
    messagesList.appendChild(li);
    chatWindow.scrollTop = chatWindow.scrollHeight;
});

// Handle sending text messages
sendButton.addEventListener("click", function (event) {
    const user = userInput.value || "Anonymous";
    const message = messageInput.value;

    if (message.trim() === "") return;

    connection.invoke("SendMessage", user, message).catch(function (err) {
        return console.error(err.toString());
    });

    messageInput.value = "";
    event.preventDefault();
});

messageInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendButton.click();
    }
});

// ==========================================
// 3. WEBRTC VIDEO CALL LOGIC
// ==========================================
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCallButton = document.getElementById("startCallButton");

let localStream;
let peerConnection;
let remoteConnectionId;

const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

// Start the camera
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        // Enable call button only after camera is secured
        startCallButton.disabled = false;
    } catch (error) {
        console.error("Error accessing media devices. Make sure you are on HTTPS!", error);
    }
}

// Setup the P2P Connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            connection.invoke("SendIceCandidate", JSON.stringify(event.candidate), remoteConnectionId || "");
        }
    };
}

// Initiate the Call
startCallButton.addEventListener("click", async () => {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Broadcast offer to the room
    connection.invoke("SendOffer", JSON.stringify(offer), "").catch(err => console.error(err));
});

// Receive Call Offer
connection.on("ReceiveOffer", async (offerString, callerId) => {
    console.log("Incoming call...");
    remoteConnectionId = callerId;
    createPeerConnection();

    const offer = JSON.parse(offerString);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    connection.invoke("SendAnswer", JSON.stringify(answer), callerId).catch(err => console.error(err));
});

// Receive Call Answer
connection.on("ReceiveAnswer", async (answerString) => {
    const answer = JSON.parse(answerString);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    console.log("Call connected!");
});

// Receive Network Routing Info
connection.on("ReceiveIceCandidate", async (candidateString) => {
    const candidate = JSON.parse(candidateString);
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

// ==========================================
// 4. START THE ENGINE
// ==========================================
connection.start().then(function () {
    // Enable text chat once connected to server
    sendButton.disabled = false;
    console.log("Connected to Charcha Hub");

    // Fire up the webcam
    startLocalStream();
}).catch(function (err) {
    return console.error("SignalR Connection Error: ", err.toString());
});