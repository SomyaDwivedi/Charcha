using Charcha.Data;
using Charcha.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;

namespace Charcha.Hubs
{
    public class ChatHub : Hub
    {
        private static readonly ConcurrentDictionary<string, string> ConnectedUsers = new();
        private readonly ApplicationDbContext _dbContext;

        public ChatHub(ApplicationDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        // Your existing text chat method
        public async Task SendMessage(string user, string message)
        {
            if (string.IsNullOrWhiteSpace(message))
            {
                return;
            }

            var chatMessage = new ChatMessage
            {
                User = string.IsNullOrWhiteSpace(user) ? "Anonymous" : user.Trim(),
                Message = message.Trim(),
                CreatedAt = DateTimeOffset.UtcNow
            };

            _dbContext.ChatMessages.Add(chatMessage);
            await _dbContext.SaveChangesAsync();

            await Clients.All.SendAsync("ReceiveMessage", chatMessage.User, chatMessage.Message, chatMessage.CreatedAt);
        }

        public async Task SendPrivateMessage(string targetConnectionId, string user, string message)
        {
            if (string.IsNullOrWhiteSpace(targetConnectionId) || string.IsNullOrWhiteSpace(message))
            {
                return;
            }

            var senderName = string.IsNullOrWhiteSpace(user) ? GetCurrentUserName() : user.Trim();
            var sentAt = DateTimeOffset.UtcNow;

            await Clients.Client(targetConnectionId).SendAsync(
                "ReceivePrivateMessage",
                Context.ConnectionId,
                senderName,
                message.Trim(),
                sentAt);
        }

        public async Task RegisterUser(string name)
        {
            ConnectedUsers[Context.ConnectionId] = string.IsNullOrWhiteSpace(name)
                ? "Anonymous"
                : name.Trim();

            await BroadcastUserList();
        }

        public async Task<IReadOnlyList<ChatMessageDto>> GetChatHistory(int? beforeMessageId = null, int take = 50)
        {
            take = Math.Clamp(take, 1, 200);

            var messages = _dbContext.ChatMessages.AsNoTracking();

            if (beforeMessageId.HasValue)
            {
                messages = messages.Where(message => message.Id < beforeMessageId.Value);
            }

            return await messages
                .OrderByDescending(message => message.CreatedAt)
                .Take(take)
                .OrderBy(message => message.CreatedAt)
                .Select(message => new ChatMessageDto
                {
                    Id = message.Id,
                    User = message.User,
                    Message = message.Message,
                    CreatedAt = message.CreatedAt
                })
                .ToListAsync();
        }

        public IReadOnlyList<ConnectedUserDto> GetConnectedUsers()
        {
            return BuildUserList();
        }

        // Sends the initial call offer
        public async Task SendOffer(string offer, string targetConnectionId)
        {
            if (!CanSendCallEventTo(targetConnectionId) || string.IsNullOrWhiteSpace(offer))
            {
                return;
            }

            await Clients.Client(targetConnectionId).SendAsync("ReceiveOffer", offer, Context.ConnectionId);
        }

        public async Task SendAnswer(string answer, string targetConnectionId)
        {
            if (!CanSendCallEventTo(targetConnectionId) || string.IsNullOrWhiteSpace(answer))
            {
                return;
            }

            await Clients.Client(targetConnectionId).SendAsync("ReceiveAnswer", answer, Context.ConnectionId);
        }

        public async Task SendIceCandidate(string candidate, string targetConnectionId)
        {
            if (!CanSendCallEventTo(targetConnectionId) || string.IsNullOrWhiteSpace(candidate))
            {
                return;
            }

            await Clients.Client(targetConnectionId).SendAsync("ReceiveIceCandidate", candidate, Context.ConnectionId);
        }

        public async Task SendEndCall(string targetConnectionId)
        {
            if (!CanSendCallEventTo(targetConnectionId))
            {
                return;
            }

            await Clients.Client(targetConnectionId).SendAsync("ReceiveEndCall", Context.ConnectionId);
        }

        public async Task RejectCall(string targetConnectionId)
        {
            if (!CanSendCallEventTo(targetConnectionId))
            {
                return;
            }

            await Clients.Client(targetConnectionId).SendAsync("CallRejected", Context.ConnectionId);
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            ConnectedUsers.TryRemove(Context.ConnectionId, out _);
            await BroadcastUserList();
            await base.OnDisconnectedAsync(exception);
        }

        private string GetCurrentUserName()
        {
            return ConnectedUsers.TryGetValue(Context.ConnectionId, out var name)
                ? name
                : "Anonymous";
        }

        private bool CanSendCallEventTo(string targetConnectionId)
        {
            return ConnectedUsers.ContainsKey(Context.ConnectionId)
                && !string.IsNullOrWhiteSpace(targetConnectionId)
                && targetConnectionId != Context.ConnectionId
                && ConnectedUsers.ContainsKey(targetConnectionId);
        }

        private static IReadOnlyList<ConnectedUserDto> BuildUserList()
        {
            return ConnectedUsers
                .OrderBy(user => user.Value)
                .Select(user => new ConnectedUserDto
                {
                    ConnectionId = user.Key,
                    Name = user.Value
                })
                .ToList();
        }

        private Task BroadcastUserList()
        {
            return Clients.All.SendAsync("ReceiveUserList", BuildUserList());
        }
    }
}
