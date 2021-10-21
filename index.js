const VOXEL_CHUNK_SIZE = 16;
const VOXEL_CHUNK_VOLUME = Math.pow(VOXEL_CHUNK_SIZE, 3);

let getAsset = makeAssetLoader();

function tripleFor(x1,y1,z1,x2,y2,z2, callback) {
  for (z = z1; z < z2; z++) {
    for (y = y1; y < y2; y++) {
      for (x = x1; x < x2; x++) {
        callback(x,y,z);   
      }
    }
  }
}

class Client {
  constructor(mainCanvas) {
    this.canvas = mainCanvas;
    this.gl = mainCanvas.getContext("webgl2");
    this.gl.getExtension("EXT_color_buffer_float");
    this.gl.viewport(0, 0, mainCanvas.width, mainCanvas.height);
    this.projectionMatrix = perspective(Math.PI / 1.3, 1, 0.1, 1000);
    this.viewMatrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
    this.lightViewMatrix =  matMultiplyMat4x4([
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      -16,-16,-16,1
    ], matMultiplyMat4x4(
      mat3x3To4x4(rotateX(-0.5)),
      mat3x3To4x4(rotateY(0.21))
    ));
      console.log(this.lightViewMatrix);

    this.lightProjectionMatrix = orthographic(40, -40, 40, -40, 40, -40);
    window.addEventListener("resize", e => {
      mainCanvas.width = window.innerWidth;
      mainCanvas.height = window.innerHeight;
      this.projectionMatrix = perspective(Math.PI / 1.3, mainCanvas.width / mainCanvas.height, 0.1, 1000);;
    });

    window.dispatchEvent(new Event("resize"));

    this.chunks = [];

    this.drawObjects = [];

    tripleFor(-0,-0,-0,1,1,1, (x,y,z) => {
      let chunk = new VoxelChunk(undefined, [x,y,z]);
      for (let i = 0; i < chunk.data.length; i++) {
        chunk.data[i] = Math.random() > 0.6 ? Math.floor(Math.random() * 5) : 0;
      }
      this.chunks.push(chunk);

      let drawChunk = new DrawVoxelChunk(this, chunk);
      this.drawObjects.push(drawChunk);
    });
    
  }

  updateDrawObjects() {
    this.drawObjects.forEach(obj => {
      obj.update(this);
    })
  }

  draw() {
    this.drawObjects.forEach(obj => {
      obj.drawShadow(this);
    });
    this.drawObjects.forEach(obj => {
       obj.draw(this);
    });
  }

  async doAsyncInitialization() {
    let gl = this.gl;
    this.programs = {
      block: await this.makeShaderPair("shaders/block.vert", "shaders/block.frag"),
      blockShadow: await this.makeShaderPair("shaders/block-shadow.vert", "shaders/shadow.frag")
    }

    this.fbos = {
      shadow: this.gl.createFramebuffer()
    }
    
    this.textures = {
      shadow1: this.gl.createTexture()
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbos.shadow);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures.shadow1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 2048, 2048, 0, gl.RED, gl.FLOAT, null);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.shadow1, 0);

    gl.clearColor(1.0, 0.0, 0.0, 1.0);
    //gl.clear(gl.COLOR_BUFFER_BIT);
    //console.log(gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE)
  }

  async makeShaderPair(vertURL, fragURL) {
    return buildShaderProgram(this.gl, await getAsset(vertURL), await getAsset(fragURL));
  }
}

class DrawVoxelChunk {
  constructor(client, sourceChunk) {
    this.sourceChunk = sourceChunk;
    let gl = client.gl;
    this.vao = gl.createVertexArray();
    this.instanceBuffer = gl.createBuffer();
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    this.modelMatrix = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      ...scalarMultiply(sourceChunk.position, sourceChunk.size), 1
    ]
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint8Array([0,1,2,1,2,3]), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0,0,1,1,0,1,1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.enableVertexAttribArray(0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_SHORT, 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribDivisor(1, 1);
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_SHORT, 4, 2);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribDivisor(2, 1);

    this.voxelChunkSize = VOXEL_CHUNK_SIZE;
    this.instanceCount = 0;
    this.update(client);
  }

  update(client) {
    if (!this.sourceChunk.isDrawObjectUpToDate) {
      let gl = client.gl;
      let instanceBufferData = this.sourceChunk.getMeshPanels()
      this.instanceCount = instanceBufferData.length/2;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, instanceBufferData, gl.STREAM_DRAW);

      this.voxelChunkSize = this.sourceChunk.size;
      this.chunkModuloBitmask = this.voxelChunkSize - 1;
      this.chunkModuloBitshift = Math.log2(this.voxelChunkSize);
      this.sourceChunk.isDrawObjectUpToDate = true;
    }
  }

  draw(client) {
    let gl = client.gl;
    client.gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, client.canvas.width, client.canvas.height);
    //gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.vao);
    //gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.useProgram(client.programs.block);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, client.textures.shadow1);
    gl.uniform1i(gl.getUniformLocation(client.programs.block, "shadowMap"), 0);
    //setUniform(gl, client.programs.block, "shadowMap", "1i", 0);
    setUniform(gl, client.programs.block, "chunkModuloBitmask", "1ui", this.voxelChunkSize - 1);
    setUniform(gl, client.programs.block, "chunkModuloBitshiftY", "1ui", this.chunkModuloBitshift);
    setUniform(gl, client.programs.block, "chunkModuloBitshiftZ", "1ui", this.chunkModuloBitshift * 2);
    gl.uniformMatrix4fv(gl.getUniformLocation(client.programs.block, "mvp"), false, matMultiplyMat4x4(matMultiplyMat4x4(this.modelMatrix, client.viewMatrix), client.projectionMatrix));
    gl.uniformMatrix4fv(gl.getUniformLocation(client.programs.block, "ml"), false, matMultiplyMat4x4(matMultiplyMat4x4(this.modelMatrix, client.lightViewMatrix), client.lightProjectionMatrix));
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, this.instanceCount);
  }

  drawShadow(client) {
    let gl = client.gl;
    gl.cullFace(gl.FRONT);
    client.gl.bindFramebuffer(gl.FRAMEBUFFER, client.fbos.shadow);
    gl.viewport(0, 0, 2048, 2048);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    //gl.clear(gl.DEPTH_BUFFER_BIT);
    //gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(this.vao);
    gl.useProgram(client.programs.blockShadow);
    setUniform(gl, client.programs.blockShadow, "chunkModuloBitmask", "1ui", this.voxelChunkSize - 1);
    setUniform(gl, client.programs.blockShadow, "chunkModuloBitshiftY", "1ui", this.chunkModuloBitshift);
    setUniform(gl, client.programs.blockShadow, "chunkModuloBitshiftZ", "1ui", this.chunkModuloBitshift * 2);
    gl.uniformMatrix4fv(gl.getUniformLocation(client.programs.blockShadow, "ml"), false,  matMultiplyMat4x4(matMultiplyMat4x4(this.modelMatrix, client.lightViewMatrix), client.lightProjectionMatrix));
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, this.instanceCount);
    gl.cullFace(gl.BACK);
  }
}

class VoxelChunk {
  constructor(data, position) {
    this.data = data;
    if (!this.data) this.data = new Uint16Array(VOXEL_CHUNK_VOLUME);
    this.position = position;
    this.size = VOXEL_CHUNK_SIZE; //future support for LODs?
    this.isDrawObjectUpToDate;
  }

  getIndexFromCoords(x, y, z) {
    return x + this.size * (y + this.size * z);
  }

  getBlockFromCoords(x, y, z) {
    return this.data[this.getIndexFromCoords(x, y, z)];
  }

  getBlockFromIndex(index) {
    return this.data[index];
  }

  setBlockFromCoords(x,y,z,block) {
    this.data[this.getIndexFromCoords(x,y,z)] = block;
    this.isDrawObjectUpToDate = false;
  }

  setBlockFromIndex(index, block) {
    this.data[index] = block;
    this.isDrawObjectUpToDate = false;
  }

  getMeshPanels() {
    let ATTRIBUTE_SIZE =
      2 /*16-bit position in chunk*/ +
      2; /*14-bit material index + 3-bit orientation*/

    let attributeBuffer = new ArrayBuffer(
      3 * (this.size + 1) * Math.pow(this.size, 2) * ATTRIBUTE_SIZE
    );
    let int16View = new Uint16Array(attributeBuffer);
    let abIndex = 0;

    function addPanel(posIndex, material, orientation) {
      int16View[abIndex] = posIndex;
      int16View[abIndex+1] = material + (orientation << 13);
      abIndex += 2;
    }

    let forBlocks = callback => {
      for (let z = 0; z < this.size; z++) {
        for (let y = 0; y < this.size; y++) {
          for (let x = 0; x < this.size; x++) {
            let index = this.getIndexFromCoords(x, y, z);
            let block = this.data[index];
            callback(x,y,z,index,block);
          }
        }
      }
    }

    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = (x != 0) ? this.data[index - 1] : 0;
        if (!adjacent) addPanel(index, block, 0);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = (x != this.size - 1) ? this.data[index + 1] : 0;
        if (!adjacent) addPanel(index, block, 1);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = y != 0 ? this.data[index - this.size] : 0;
        if (!adjacent) addPanel(index, block, 2);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = y != this.size - 1 ? this.data[index + this.size] : 0;
        if (!adjacent) addPanel(index, block, 3);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = z != 0 ? this.data[index - this.size * this.size] : 0;
        if (!adjacent) addPanel(index, block, 4);
      }
    });
    forBlocks((x,y,z,index,block) => {
      if (block) {
        let adjacent = z != this.size - 1 ? this.data[index + this.size * this.size] : 0;
        if (!adjacent) addPanel(index, block, 5);
      }
    });

    return int16View.subarray(0, abIndex);
  }
}

let mouseMovement = [0, 0];
document.addEventListener("mousemove", e => {
  mouseMovement[0] += e.movementX;
  mouseMovement[1] += e.movementY;
});

let keys = createKeyHandler();

let t = 0;
async function main() {
  let rotationY = 0;
  let rotationX = 0;

  
  let viewerPosition =[0, 0, 0];
  let viewerVelocity = [0, 0, 0];

  let canvas = document.getElementById("canvas");

  setupPointerLock(canvas);

  let client = new Client(canvas);

  await client.doAsyncInitialization();

  let chunk = new VoxelChunk();
  for (let i = 0; i < chunk.data.length; i++) {
    chunk.data[i] = Math.random() > 0.6 ? Math.floor(Math.random() * 5) : 0;
  }
  //chunk.data[0] = 1;
  //chunk.data[1] = 1;
  console.log(chunk, chunk.getMeshPanels());

  //let drawChunk = new DrawVoxelChunk(client);
  //drawChunk.updateAttribs(client, chunk.getMeshPanels());
  //drawChunk.updateSize(client, VOXEL_CHUNK_SIZE);
  function loop() {
    rotationY += mouseMovement[0] * 0.003;
    rotationX += mouseMovement[1] * 0.003;
    mouseMovement = [0, 0];

    if (keys.a) {
      viewerVelocity[0] += Math.cos(rotationY) * 0.01;
      viewerVelocity[2] += Math.sin(rotationY) * 0.01;
    }
    if (keys.d) {
      viewerVelocity[0] -= Math.cos(rotationY) * 0.01;
      viewerVelocity[2] -= Math.sin(rotationY) * 0.01;
    }
    if (keys.w) {
      viewerVelocity[0] += -Math.sin(rotationY) * 0.01;
      viewerVelocity[2] += Math.cos(rotationY) * 0.01;
    }
    if (keys.s) {
      viewerVelocity[0] -= -Math.sin(rotationY) * 0.01;
      viewerVelocity[2] -= Math.cos(rotationY) * 0.01;
    }
    if (keys[" "]) {
      viewerVelocity[1] -= 0.01;
    }
    if (keys.shift) {
      viewerVelocity[1] += 0.01
    }

    viewerPosition = vectorAdd(viewerPosition, viewerVelocity);
    viewerVelocity = scalarMultiply(viewerVelocity, 0.9);

    rotationX = Math.max(Math.min(rotationX, Math.PI / 2), -Math.PI / 2)
    let rotmat = matMultiplyMat(rotateY(-rotationY), rotateX(-rotationX));
    client.viewMatrix = matMultiplyMat4x4([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      viewerPosition[0], viewerPosition[1], viewerPosition[2], 1
    ],[
      rotmat[0], rotmat[1], rotmat[2], 0,
      rotmat[3], rotmat[4], rotmat[5], 0,
      rotmat[6], rotmat[7], rotmat[8], 0,
      0, 0, 0, 1
    ]);

    // for (let i = 0; i < 10; i++) {
    //   client.chunks[Math.floor(Math.random() * client.chunks.length)].setBlockFromIndex(
    //     Math.floor(Math.random() * client.chunks[0].data.length), 
    //     Math.random() > 0.6 ? Math.floor(Math.random() * 5) : 0
    //   );
    // }

    client.updateDrawObjects();
    client.draw();
    //drawChunk.draw(client);
    //console.log(client.gl.getError());
    t++;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

main();