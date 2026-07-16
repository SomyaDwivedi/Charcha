using Microsoft.AspNetCore.SignalR;

namespace Charcha.Hubs
{
    public class ChatHub : Hub
    {
        // Your existing text chat method
        public async Task SendMessage(string user, string message)
        {
            await Clients.All.SendAsync("ReceiveMessage", user, message);
        }

        // --- NEW WEBRTC SIGNALING METHODS ---

        // 1. Sends the initial call offer
        public async Task SendOffer(string offer, string targetConnectionId)
        {
            // For a basic global room, we broadcast the offer to "Others"
            // In a real app, you would target a specific ConnectionId
            await Clients.Others.SendAsync("ReceiveOffer", offer, Context.ConnectionId);
        }

        // 2. Sends the answer to the offer
        public async Task SendAnswer(string answer, string targetConnectionId)
        {
            await Clients.Client(targetConnectionId).SendAsync("ReceiveAnswer", answer);
        }

        // 3. Shares network routing info (ICE Candidates)
        public async Task SendIceCandidate(string candidate, string targetConnectionId)
        {
            await Clients.Client(targetConnectionId).SendAsync("ReceiveIceCandidate", candidate);
        }
    }
}