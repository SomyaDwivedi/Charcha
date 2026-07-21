namespace Charcha.Models
{
    public class ChatMessageDto
    {
        public int Id { get; set; }

        public string User { get; set; } = string.Empty;

        public string Message { get; set; } = string.Empty;

        public DateTimeOffset CreatedAt { get; set; }
    }
}
