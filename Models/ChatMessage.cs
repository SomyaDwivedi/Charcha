using System.ComponentModel.DataAnnotations;

namespace Charcha.Models
{
    public class ChatMessage
    {
        public int Id { get; set; }

        [Required]
        [StringLength(100)]
        public string User { get; set; } = string.Empty;

        [Required]
        [StringLength(1000)]
        public string Message { get; set; } = string.Empty;

        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}
