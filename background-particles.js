// Create background particle container
function initBackgroundParticles() {
    const container = document.createElement('div');
    container.id = 'background-particles-container';
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
        overflow: hidden;
    `;
    document.body.appendChild(container);

    // Add CSS for particles
    const style = document.createElement('style');
    style.textContent = `
        .background-particle {
            position: absolute;
            background: white;
            border-radius: 50%;
            pointer-events: none;
            opacity: 0;
            transition: opacity 2s ease-in-out;
            will-change: transform, opacity, width, height;
            filter: blur(0);
        }
    `;
    document.head.appendChild(style);

    return container;
}

// Create a single background particle
function createBackgroundParticle(container) {
    const particle = document.createElement('div');
    particle.className = 'background-particle';
    
    // Slightly larger initial size for diffusion effect
    const size = Math.random() * 3 + 1.5;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    
    // Position particle randomly on screen
    initializeParticle(particle);
    container.appendChild(particle);
    
    // Start animation
    animateParticle(particle);
}

// Initialize particle position anywhere on screen
function initializeParticle(particle) {
    particle.style.transition = 'none';
    particle.style.opacity = Math.random() * 0.25 + 0.05; // More subtle opacity
    particle.style.transform = 'translate(0, 0) scale(1)';
    
    // Random position across entire screen
    const posX = Math.random() * 100;
    const posY = Math.random() * 100;
    particle.style.left = `${posX}%`;
    particle.style.top = `${posY}%`;
    
    // Store initial position for wandering
    particle.dataset.baseX = posX;
    particle.dataset.baseY = posY;
    particle.dataset.angle = Math.random() * Math.PI * 2;
    particle.dataset.angleSpeed = (Math.random() - 0.5) * 0.001;
    particle.dataset.radius = Math.random() * 15 + 5;
    particle.dataset.radiusSpeed = (Math.random() - 0.5) * 0.01;
    
    // Force reflow
    particle.offsetHeight;
}

// Animate a particle
function animateParticle(particle) {
    let startTime = performance.now();
    let lastTime = startTime;
    
    // Animation function
    function update() {
        const currentTime = performance.now();
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;
        const totalTime = currentTime - startTime;
        
        // Update angle and radius for circular motion
        let angle = parseFloat(particle.dataset.angle);
        let angleSpeed = parseFloat(particle.dataset.angleSpeed);
        let radius = parseFloat(particle.dataset.radius);
        let radiusSpeed = parseFloat(particle.dataset.radiusSpeed);
        
        // Update position with wandering motion
        angle += angleSpeed * deltaTime;
        radius += radiusSpeed * deltaTime;
        
        // Reverse radius direction if too large or small
        if (radius > 20 || radius < 5) {
            radiusSpeed = -radiusSpeed;
            particle.dataset.radiusSpeed = radiusSpeed;
        }
        
        // Calculate new position
        const baseX = parseFloat(particle.dataset.baseX);
        const baseY = parseFloat(particle.dataset.baseY);
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;
        
        // Apply transforms
        const scale = Math.random() * 0.3 + 0.5;
        const rotate = angle * (180 / Math.PI);
        particle.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotate}deg)`;
        
        // Update stored values
        particle.dataset.angle = angle;
        particle.dataset.radius = radius;
        
        // Continue animation if particle still exists
        if (totalTime < 15000 && particle.isConnected) {
            requestAnimationFrame(update);
        } else if (particle.isConnected) {
            // Reset and restart animation
            initializeParticle(particle);
            animateParticle(particle);
        }
        
        // Fade out towards end
        if (totalTime > 13000 && particle.isConnected) {
            particle.style.opacity = '0';
        }
    }
    
    // Start the animation loop
    requestAnimationFrame(update);
}

// Initialize the background particles
function initParticleAnimation() {
    let container = initBackgroundParticles();
    const particleCount = 140; // Reduced by 30% from 200
    
    function createInitialParticles() {
        // Clear existing particles
        if (container) {
            container.remove();
        }
        container = initBackgroundParticles();
        
        // Create initial particles spread across screen
        for (let i = 0; i < particleCount; i++) {
            setTimeout(() => {
                createBackgroundParticle(container);
            }, i * 75); // Slightly longer delay between spawns
        }
    }
    
    // Create initial particles
    createInitialParticles();
    
    // Restart animation every 8 seconds
    setInterval(createInitialParticles, 8000);
    
    // Continuously add new particles
    setInterval(() => {
        // Add new particles frequently
        for (let i = 0; i < 2; i++) { // Reduced from 3 to 2 particles at a time
            if (container.children.length < particleCount) {
                createBackgroundParticle(container);
            }
        }
    }, 750); // Increased interval
    
    // Ensure minimum particle count is maintained
    setInterval(() => {
        if (container.children.length < particleCount) {
            const particlesToAdd = particleCount - container.children.length;
            for (let i = 0; i < particlesToAdd; i++) {
                createBackgroundParticle(container);
            }
        }
    }, 2000);
}

// Start the background particle animation
initParticleAnimation(); 
