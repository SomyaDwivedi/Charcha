using Charcha.Models;
using Microsoft.EntityFrameworkCore;

namespace Charcha.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<ChatMessage>(entity =>
            {
                entity.Property(message => message.User)
                    .HasMaxLength(100)
                    .IsRequired();

                entity.Property(message => message.Message)
                    .HasMaxLength(1000)
                    .IsRequired();

                entity.Property(message => message.CreatedAt)
                    .HasDefaultValueSql("SYSDATETIMEOFFSET()");
            });
        }
    }
}
