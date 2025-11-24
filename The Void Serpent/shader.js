/**
 * 🔮 虚空视觉引擎 (Void Shader Engine)
 * 独立模块：负责将 2D Canvas 作为纹理，通过 WebGL 进行后处理渲染
 */
class PostProcessor {
    constructor(sourceCanvas) {
        this.sourceCanvas = sourceCanvas;
        this.width = sourceCanvas.width;
        this.height = sourceCanvas.height;

        // 1. 创建覆盖用的 WebGL Canvas
        this.glCanvas = document.createElement('canvas');
        // 修改构造函数中的 style 设置
        Object.assign(this.glCanvas.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: '1' // ★ 设为1，确保盖住原Canvas(通常是0)，但低于 UI(10或100)
        });
        document.body.appendChild(this.glCanvas);

        // 2. 初始化 WebGL 上下文
        this.gl = this.glCanvas.getContext('webgl');
        if (!this.gl) {
            console.error("WebGL not supported, shader effects disabled.");
            return;
        }

        this.resize();

        // --- 顶点着色器 (Vertex Shader) ---
        // 负责处理画布的位置映射
        const vsSource = `
            attribute vec2 a_position;
            varying vec2 v_texCoord;
            void main() {
                gl_Position = vec4(a_position, 0, 1);
                // 将坐标从 [-1, 1] 映射到 [0, 1]
                v_texCoord = (a_position + 1.0) / 2.0;
                v_texCoord.y = 1.0 - v_texCoord.y; // WebGL 纹理坐标垂直翻转
            }
        `;

        // --- 片元着色器 (Fragment Shader) ---
        // ★★★ 核心：克苏鲁滤镜逻辑 ★★★
        const fsSource = `
            precision mediump float;
            uniform sampler2D u_image;
            uniform float u_time;
            uniform vec2 u_resolution;
            uniform float u_distortion; // 扭曲强度 (由主脚本控制)
            varying vec2 v_texCoord;

            // 随机噪点函数
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            void main() {
                vec2 uv = v_texCoord;
                vec2 center = vec2(0.5);

                // 1. 空间呼吸 (Breathing)
                // 整个画面微微放大缩小，像生物内脏
                float breath = sin(u_time * 0.8) * 0.003 * u_distortion;
                uv = (uv - center) * (1.0 - breath) + center;

                // 2. 液体波动 (Fluid Wave)
                // 模拟深海压强或高温扭曲
                float waveX = sin(uv.y * 10.0 + u_time) * 0.002 * u_distortion;
                float waveY = cos(uv.x * 10.0 + u_time) * 0.002 * u_distortion;
                uv.x += waveX;
                uv.y += waveY;

                // 3. RGB 色散 (Chromatic Aberration) - 精神污染核心
                // 越靠近边缘，色散越严重
                float dist = distance(uv, center);
                float aber = (0.005 + 0.015 * u_distortion) * dist * u_distortion;

                vec4 r = texture2D(u_image, uv + vec2(aber, 0.0));
                vec4 g = texture2D(u_image, uv);
                vec4 b = texture2D(u_image, uv - vec2(aber, 0.0));

                // 4. 胶片噪点 (Film Grain)
                float noise = random(uv + u_time) * 0.05 * u_distortion;

                // 5. 暗角 (Vignette)
                float vignette = 1.0 - smoothstep(0.4, 1.5, dist * (1.0 + u_distortion * 0.5));

                vec3 color = vec3(r.r, g.g, b.b);
                color += noise; // 叠加噪点
                color *= vignette; // 叠加暗角

                // 增加对比度，让黑色更黑
                color = pow(color, vec3(1.1));

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        // 3. 编译程序
        this.program = this.createProgram(vsSource, fsSource);
        this.positionLocation = this.gl.getAttribLocation(this.program, "a_position");

        // 4. 创建缓冲区 (覆盖全屏的两个三角形)
        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1, -1,  1,
            -1,  1,  1, -1,  1,  1,
        ]), this.gl.STATIC_DRAW);

        // 5. 创建纹理对象
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        // 设置纹理参数：边缘拉伸，线性插值
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    }

    resize() {
        this.glCanvas.width = window.innerWidth;
        this.glCanvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.gl.canvas.width, this.gl.canvas.height);
    }

    // 每帧调用此函数进行渲染
    render(time, intensity) {
        if (!this.gl) return;
        const gl = this.gl;

        // A. 将原始 2D Canvas 的画面上传到 GPU 纹理
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);

        // B. 使用 Shader 程序
        gl.useProgram(this.program);

        // C. 绑定顶点数据
        gl.enableVertexAttribArray(this.positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

        // D. 传递 Uniform 参数 (时间、分辨率、扭曲度)
        gl.uniform1i(gl.getUniformLocation(this.program, "u_image"), 0);
        gl.uniform1f(gl.getUniformLocation(this.program, "u_time"), time);
        gl.uniform2f(gl.getUniformLocation(this.program, "u_resolution"), this.glCanvas.width, this.glCanvas.height);
        gl.uniform1f(gl.getUniformLocation(this.program, "u_distortion"), intensity);

        // E. 绘制
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // 辅助：编译 Shader
    createProgram(vs, fs) {
        const program = this.gl.createProgram();
        const vShader = this.createShader(this.gl.VERTEX_SHADER, vs);
        const fShader = this.createShader(this.gl.FRAGMENT_SHADER, fs);
        this.gl.attachShader(program, vShader);
        this.gl.attachShader(program, fShader);
        this.gl.linkProgram(program);
        return program;
    }

    // 辅助：创建 Shader 对象
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
}
