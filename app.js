
const socket = io('/');
const videoGrid = document.querySelector('#video-grid');
const peers = {};

// PeerJS setup
const myPeer = new Peer(undefined, {
    host: '/',
    port: '3001'
});

const myVideo = document.createElement('video');
myVideo.muted = true;

// Get user media
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
.then(stream => {
    addVideoStream(myVideo, stream);

    // Handle incoming calls
    myPeer.on('call', call => {
        call.answer(stream);
        const video = document.createElement('video');
        call.on('stream', userVideoStream => addVideoStream(video, userVideoStream));
    });

    // New user connected
    socket.on('user-connected', userId => {
        connectToNewUser(userId, stream);
    });

    // --- Phase 1: Focus Detection ---
    const faceMesh = new FaceMesh({locateFile: file => 
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMesh.setOptions({
        maxNumFaces: 2,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    faceMesh.onResults(onFaceResults);

    const camera = new Camera(myVideo, {
        onFrame: async () => await faceMesh.send({image: myVideo}),
        width: 640,
        height: 480
    });
    camera.start();

    let lastFaceTime = Date.now();
    let lastLookAwayTime = Date.now();

    function onFaceResults(results) {
        const logsDiv = document.getElementById("logs");

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            if (Date.now() - lastFaceTime > 10000) {
                logsDiv.innerHTML += `<p>[${new Date().toLocaleTimeString()}] No face detected</p>`;
                lastFaceTime = Date.now();
            }
            return;
        }

        if (results.multiFaceLandmarks.length > 1) {
            logsDiv.innerHTML += `<p>[${new Date().toLocaleTimeString()}] Multiple faces detected</p>`;
        }

        // Simple gaze check
        const face = results.multiFaceLandmarks[0];
        const leftEye = face[159];
        const rightEye = face[386];
        const eyeCenterX = (leftEye.x + rightEye.x)/2;

        if (eyeCenterX < 0.3 || eyeCenterX > 0.7) {
            if (Date.now() - lastLookAwayTime > 5000) {
                logsDiv.innerHTML += `<p>[${new Date().toLocaleTimeString()}] User looking away</p>`;
                lastLookAwayTime = Date.now();
            }
        } else {
            lastLookAwayTime = Date.now();
            lastFaceTime = Date.now();
        }
        logsDiv.scrollTop = logsDiv.scrollHeight;
    }

    // --- Phase 2: Object Detection ---
    let model;
    cocoSsd.load().then(loadedModel => { model = loadedModel; detectObjects(); });

    async function detectObjects() {
        if (!model) return;
        const predictions = await model.detect(myVideo);
        const logsDiv = document.getElementById("logs");

        predictions.forEach(pred => {
            if (["cell phone", "book", "laptop"].includes(pred.class) && pred.score > 0.6) {
                logsDiv.innerHTML += `<p>[${new Date().toLocaleTimeString()}] Detected: ${pred.class}</p>`;
            }
        });

        logsDiv.scrollTop = logsDiv.scrollHeight;
        requestAnimationFrame(detectObjects);
    }
});

// Handle disconnect
socket.on('user-disconnected', userId => {
    if (peers[userId]) peers[userId].close();
});

// PeerJS open
myPeer.on('open', id => {
    socket.emit('join-room', ROOM_ID, id);
});

// Connect new user
function connectToNewUser(userId, stream) {
    const call = myPeer.call(userId, stream);
    const video = document.createElement('video');
    call.on('stream', userVideoStream => addVideoStream(video, userVideoStream));
    call.on('close', () => video.remove());
    peers[userId] = call;
}

// Add video stream
function addVideoStream(video, stream) {
    video.srcObject = stream;
    video.addEventListener('loadedmetadata', () => video.play());
    videoGrid.append(video);
}
