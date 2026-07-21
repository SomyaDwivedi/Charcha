using Charcha.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Charcha.Controllers
{
    public class HomeController : Controller
    {
        private readonly ApplicationDbContext _dbContext;

        public HomeController(ApplicationDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<IActionResult> Index()
        {
            var messages = await _dbContext.ChatMessages
                .OrderByDescending(message => message.CreatedAt)
                .Take(50)
                .OrderBy(message => message.CreatedAt)
                .ToListAsync();

            return View(messages);
        }
    }
}
