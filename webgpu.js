// This function initializes WebGPU and sets up the particle system.
async function initWebGPU() {
    const x_axis = document.getElementById("x-axis");
    const y_axis = document.getElementById("y-axis");
    const x_text = document.getElementById("x-text");
    const y_text = document.getElementById("y-text");
    let posX;
    let posY;


    function getMousePos(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }
    

    if (!navigator.gpu) {
        alert("WebGPU is not supported by this browser.");
        return;
    }

    // Get GPU adapter and device
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();

    // Get the canvas and context
    const canvas = document.getElementById("webgpuCanvas");

    canvas.addEventListener('mousemove', function(event) {
        const mousePos = getMousePos(canvas, event);
        posX = mousePos.x;
        posY = mousePos.y;
    
        // Do something with posX and posY
        x_axis.innerText = "X: " + (posX-250)/250;
        y_axis.innerText = "Y: " + (posY-250)/250;
    });

    const context = canvas.getContext("webgpu");

    // Configure the context
    const format = "bgra8unorm";
    context.configure({
        device: device,
        format: format
    });

    // Corrected WGSL Shader Code
    const shaderCode = `
    struct VertexOut {
        @builtin(position) position : vec4<f32>,
        @location(0) color : vec4<f32>
      }
      
      @vertex
      fn vertex_main(@location(0) position: vec4<f32>) -> VertexOut {
        var output : VertexOut;
        output.position = position;
        // Assuming a default color value since your original code doesn't include color data
        output.color = vec4<f32>(1.0, 1.0, 1.0, 1.0); // White color
        return output;
      }

      @fragment
      fn fragment_main(fragData: VertexOut) -> @location(0) vec4<f32> {
        // Return red color regardless of the input color
        return vec4<f32>(1.0, 1.0, 1.0, 1.0); // Red color
      }
        
    `;
    const shaderModule = device.createShaderModule({ code: shaderCode });

    // Create buffers for particles
    // Initial positions and velocities for the particles
    const numParticles = 5000;
    let particlePositions = new Float32Array(numParticles * 2); // x, y for each particle
    let particleVelocities = new Float32Array(numParticles * 2); // vx, vy for each particle

    for (let i = 0; i < numParticles; i++) {
        particlePositions[i * 2] = (Math.random() * 2 - 1) * canvas.width / canvas.height; // x
        particlePositions[i * 2 + 1] = (Math.random() * 2 - 1); // y
        
        particleVelocities[i * 2] = (Math.random() - 0.5) * 0.002; // vx
        particleVelocities[i * 2 + 1] = (Math.random() - 0.5) * 0.002; // vy

        // particleVelocities[i * 2] = 0; // vx
        // particleVelocities[i * 2 + 1] = 0; // vy
    }

    // Create GPU buffers
    const particleBuffer = device.createBuffer({
        size: particlePositions.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(particleBuffer.getMappedRange()).set(particlePositions);
    particleBuffer.unmap();

    // Create pipeline and bind group
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [] });
    const renderPipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: shaderModule,
            entryPoint: 'vertex_main',
            buffers: [{
                arrayStride: 2 * particlePositions.BYTES_PER_ELEMENT,
                attributes: [{
                    shaderLocation: 0,
                    offset: 0,
                    format: 'float32x2'
                }],
            }],
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fragment_main',
            targets: [{ format: format }],
        },
        primitive: {
            topology: 'point-list',
        },
    });

    // Animation loop
    function updateParticles() {
        const boundary = 1;
        //const gravity = -0.001;
        const mouseInfluenceRadius = 0.1; // Adjust this value as needed
        const mouseInfluenceFactor = 0.01; // Adjust this value as needed

        for (let i = 0; i < numParticles; i++) {
            //particleVelocities[i * 2 + 1] += gravity;
            particlePositions[i * 2] += particleVelocities[i * 2]; // Update x position
            particlePositions[i * 2 + 1] += particleVelocities[i * 2 + 1]; // Update y position
            if (Math.abs(particlePositions[i * 2]) > boundary){
                particleVelocities[i * 2] *= -1;
                //particlePositions[i * 2] = Math.sign(particlePositions[i*2]) * boundary;
                
            } 
            
            if (Math.abs(particlePositions[i * 2 + 1]) > boundary){
                particleVelocities[i * 2 + 1] *= -1;
                if (i == 0){
                    console.log("hit");
                }
                //particlePositions[i * 2 + 1] = Math.sign(particlePositions[ i * 2 + 1]) * boundary;
            } 

            let dx = (posX-250)/250 - particlePositions[i * 2];
            let dy = (posY-250)/250 - particlePositions[i * 2 + 1];
            let distanceToMouse = Math.sqrt(dx * dx + dy * dy);

            if (distanceToMouse < mouseInfluenceRadius) {
                particleVelocities[i * 2] += dx * mouseInfluenceFactor;
                particleVelocities[i * 2 + 1] += dy * mouseInfluenceFactor;

            }
            // if (particlePositions[i * 2] > ((posX-250)/250 - 0.01)){
            //     particleVelocities[i * 2] += 0.003;
            //     particleVelocities[i * 2 + 1] += 0.003;
            // }
        }

        // Copy the updated positions back to the GPU buffer
        device.queue.writeBuffer(
            particleBuffer,
            0,
            particlePositions.buffer,
            particlePositions.byteOffset,
            particlePositions.byteLength
        );
        
    }

    function render() {
        updateParticles();
        //const start = performance.now();
        x_text.innerText = particlePositions[0];
        y_text.innerText = particlePositions[1];
        
        const commandEncoder = device.createCommandEncoder();
        const textureView = context.getCurrentTexture().createView();
        const renderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                loadOp: 'clear',
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                storeOp: 'store',
            }],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(renderPipeline);
        passEncoder.setVertexBuffer(0, particleBuffer);
        passEncoder.draw(numParticles);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(render);
        //const end = performance.now();
        //frame.innerText = (end - start)*100000;
    }

    requestAnimationFrame(render);
}

window.onload = initWebGPU;
