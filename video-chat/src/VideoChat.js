import React, { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:5000"); // signaling server

export default function VideoChat() {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);

  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);

  // Start local video + create peer connection
  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("Got Media Stream:", stream);

      // ✅ Attach stream safely
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;

        // Force the video element to play
        localVideoRef.current.onloadedmetadata = async () => {
          try {
            await localVideoRef.current.play();
            console.log("Local video playing");
            console.log("Video tracks:", stream.getVideoTracks());
          } catch (err) {
            console.error("Error starting local video:", err);
          }
        };
      } else {
        setTimeout(() => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            console.log("Attached stream to local video (delayed)");
          }
        }, 100);
      }

      // Create peer connection with STUN (for internet support later)
      peerConnection.current = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", event.candidate, roomId);
        }
      };

      peerConnection.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Add local tracks
      stream.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, stream);
      });
    } catch (err) {
      console.error("Error accessing media devices:", err.name, err.message);
    }
  }, [roomId]);

  // Join room
  const joinRoom = () => {
    setJoined(true);
    socket.emit("join", roomId);
  };

  useEffect(() => {
    // When joined
    socket.on("joined", async ({ numClients }) => {
      await startVideo();

      if (numClients === 2) {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit("offer", offer, roomId);
      }
    });

    // When receiving an offer
    socket.on("offer", async (offer) => {
      if (!peerConnection.current) await startVideo();

      await peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );

      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("answer", answer, roomId);
    });

    // When receiving an answer
    socket.on("answer", async (answer) => {
      if (
        peerConnection.current &&
        peerConnection.current.signalingState === "have-local-offer"
      ) {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(answer)
        );
      }
    });

    // ICE candidates
    socket.on("ice-candidate", (candidate) => {
      if (peerConnection.current) {
        peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    // Cleanup
    return () => {
      socket.off("joined");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
    };
  }, [roomId, startVideo]);

  return (
    <div style={{ padding: "20px" }}>
      <h1>React Video Chat</h1>

      {!joined ? (
        <div>
          <input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "20px" }}>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "300px", border: "1px solid black" }}
          />
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: "300px", border: "1px solid black" }}
          />
        </div>
      )}
    </div>
  );
}
