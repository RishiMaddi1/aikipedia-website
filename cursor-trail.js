// Create particle container if it doesn't exist
function initParticleContainer() {
    let container = document.getElementById('particles-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'particles-container';
        container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999;
            will-change: transform;
        `;
        document.body.appendChild(container);
    }
    return container;
}

// Create a particle at the cursor position
function createParticle(x, y, container) {
    const particle = document.createElement('div');
    particle.className = 'cursor-particle';
    
    // Get current scroll position
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    // Set initial position at cursor relative to document
    particle.style.left = `${x + scrollX}px`;
    particle.style.top = `${y + scrollY}px`;
    
    // Random size between 2-4px
    const size = Math.random() * 2 + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    
    // Add to container
    container.appendChild(particle);
    
    // Animate the particle
    setTimeout(() => {
        particle.style.transform = `translate(${(Math.random() - 0.5) * 20}px, ${(Math.random() - 0.5) * 20}px)`;
        particle.style.opacity = '0';
    }, 10);
    
    // Remove particle after animation
    setTimeout(() => {
        particle.remove();
    }, 1000);
}

// Initialize cursor trail effect
function initCursorTrail() {
    // Add required CSS
    const style = document.createElement('style');
    style.textContent = `
        .cursor-particle {
            position: absolute;
            background: white;
            border-radius: 50%;
            pointer-events: none;
            opacity: 0.6;
            transition: all 1s ease-out;
            will-change: transform, opacity;
        }
    `;
    document.head.appendChild(style);
    
    // Initialize particle container
    const container = initParticleContainer();
    let lastKnownX = 0;
    let lastKnownY = 0;
    
    // Add mousemove listener
    document.addEventListener('mousemove', (e) => {
        lastKnownX = e.clientX;
        lastKnownY = e.clientY;
        // Create 2-3 particles per movement for a trail effect
        for (let i = 0; i < Math.random() * 2 + 1; i++) {
            createParticle(lastKnownX, lastKnownY, container);
        }
    });

    // Handle scroll events
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                // Update existing particles positions
                const particles = container.getElementsByClassName('cursor-particle');
                const scrollX = window.scrollX || window.pageXOffset;
                const scrollY = window.scrollY || window.pageYOffset;
                
                Array.from(particles).forEach(particle => {
                    const rect = particle.getBoundingClientRect();
                    const absoluteLeft = rect.left + scrollX;
                    const absoluteTop = rect.top + scrollY;
                    
                    particle.style.left = `${absoluteLeft}px`;
                    particle.style.top = `${absoluteTop}px`;
                });
                
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// Start the cursor trail effect
initCursorTrail(); 