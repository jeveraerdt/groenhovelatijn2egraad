/* =========================================
   APP.JS - Minimale site interactie
   ========================================= */

document.addEventListener('DOMContentLoaded', function() {
  console.log('Groenhove Latijn 2e Graad - Site geladen');
  
  // Smooth scrolling voor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
  
  console.log('JavaScript geladen en klaar');
});