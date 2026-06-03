import zlib
import struct
import math

def is_inside_mic(u, v):
    # 1. Corpo do microfone (retângulo arredondado centralizado)
    # Círculo superior: centro (0.5, 160/512), raio 50/512
    if (u - 0.5)**2 + (v - 160/512)**2 <= (50/512)**2:
        return True
    # Círculo inferior: centro (0.5, 240/512), raio 50/512
    if (u - 0.5)**2 + (v - 240/512)**2 <= (50/512)**2:
        return True
    # Corpo central: u em [206/512, 306/512], v em [160/512, 240/512]
    if (206/512) <= u <= (306/512) and (160/512) <= v <= (240/512):
        return True
        
    # 2. Suporte em formato de U (espessura do traço 20/512, então distância <= 10/512)
    dist_stand = 999.0
    if v <= 240/512:
        # Distância ao segmento esquerdo: u = 166/512, v em [200/512, 240/512]
        if (200/512) <= v <= (240/512):
            dist_stand = min(dist_stand, abs(u - 166/512))
        else:
            # Extremidade superior esquerda (166/512, 200/512)
            d_ep1 = math.sqrt((u - 166/512)**2 + (v - 200/512)**2)
            dist_stand = min(dist_stand, d_ep1)
            
        # Distância ao segmento direito: u = 346/512, v em [200/512, 240/512]
        if (200/512) <= v <= (240/512):
            dist_stand = min(dist_stand, abs(u - 346/512))
        else:
            # Extremidade superior direita (346/512, 200/512)
            d_ep2 = math.sqrt((u - 346/512)**2 + (v - 200/512)**2)
            dist_stand = min(dist_stand, d_ep2)
    else:
        # Distância ao semicírculo inferior: centro (0.5, 240/512), raio 90/512
        dist_to_center = math.sqrt((u - 0.5)**2 + (v - 240/512)**2)
        dist_stand = min(dist_stand, abs(dist_to_center - 90/512))
        
    if dist_stand <= 10/512:
        return True
        
    # 3. Haste vertical de conexão: u em [246/512, 266/512], v em [330/512, 390/512]
    if (246/512) <= u <= (266/512) and (330/512) <= v <= (390/512):
        return True
        
    # 4. Base horizontal (largura 160, altura 20, raio de canto 10, centro (0.5, 390/512))
    # Limites: u em [176/512, 336/512], v em [380/512, 400/512]
    if (186/512) <= u <= (326/512) and (380/512) <= v <= (400/512):
        return True
    if (u - 186/512)**2 + (v - 390/512)**2 <= (10/512)**2:
        return True
    if (u - 326/512)**2 + (v - 390/512)**2 <= (10/512)**2:
        return True
        
    return False

def generate_image(width, height):
    pixels = bytearray()
    for y in range(height):
        for x in range(width):
            # Supersampling 3x3 para antialiasing perfeito
            hits = 0
            for dy in [-1/3, 0, 1/3]:
                for dx in [-1/3, 0, 1/3]:
                    u = (x + 0.5 + dx) / width
                    v = (y + 0.5 + dy) / height
                    if is_inside_mic(u, v):
                        hits += 1
            # Interpolação linear entre fundo azul #00aaff (0, 170, 255) e branco (255, 255, 255)
            r = int(0 * (9 - hits)/9 + 255 * hits/9)
            g = int(170 * (9 - hits)/9 + 255 * hits/9)
            b = int(255 * (9 - hits)/9 + 255 * hits/9)
            pixels.append(r)
            pixels.append(g)
            pixels.append(b)
    return pixels

def write_png(filename, width, height, pixels):
    png = bytearray([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    
    def add_chunk(tag, data):
        nonlocal png
        png += struct.pack('>I', len(data))
        png += tag
        png += data
        png += struct.pack('>I', zlib.crc32(tag + data))
        
    add_chunk(b'IHDR', ihdr_data)
    
    scanlines = bytearray()
    for y in range(height):
        scanlines.append(0) # Filter type 0 (None)
        scanlines += pixels[y * width * 3 : (y + 1) * width * 3]
        
    idat_data = zlib.compress(scanlines)
    add_chunk(b'IDAT', idat_data)
    add_chunk(b'IEND', b'')
    
    with open(filename, 'wb') as f:
        f.write(png)

print("Gerando icon-192.png...")
pixels_192 = generate_image(192, 192)
write_png("icon-192.png", 192, 192, pixels_192)

print("Gerando icon-512.png...")
pixels_512 = generate_image(512, 512)
write_png("icon-512.png", 512, 512, pixels_512)

print("Geração dos ícones concluída com sucesso!")
