# 🎵 Audio Files - Rock Paper Scissors Game

Este juego está **completamente listo** para implementar sonidos inmersivos. Solo necesitas descargar los archivos de audio y colocarlos en las carpetas correspondientes.

## 📁 Estructura de Carpetas

Todos los archivos de audio deben ir dentro de:
```
public/sounds/
├── sfx/              # Efectos de sonido
├── voices/announcer/ # Narración
└── music/            # Música de fondo
```

## 🎧 Archivos Requeridos

### Efectos de Sonido (SFX)
Coloca estos archivos en `public/sounds/sfx/`:

1. **click.mp3** - Sonido de clic de botones (UI)
2. **countdown.mp3** - Sonido de cuenta regresiva (3, 2, 1...)
3. **fight.mp3** - Grito épico de "FIGHT!" al iniciar ronda
4. **collision.mp3** - Impacto de manos chocando 💥
5. **win_round.mp3** - Efecto corto al ganar una ronda
6. **lose_round.mp3** - Efecto corto al perder una ronda
7. **tie.mp3** - Sonido de empate
8. **match_alert.mp3** *(Opcional)* - Alerta de emparejamiento encontrado

### Narración (Voices)
Coloca estos archivos en `public/sounds/voices/announcer/`:

1. **win_game.mp3** - Voz épica: "VICTORY!" 🏆
2. **lose_game.mp3** - Voz dramática: "DEFEAT!" 💀
3. **rock.mp3** *(Futuro)* - Voz: "Rock!"
4. **paper.mp3** *(Futuro)* - Voz: "Paper!"
5. **scissors.mp3** *(Futuro)* - Voz: "Scissors!"

### Música de Fondo (Music)
Coloca estos archivos en `public/sounds/music/`:

1. **menu_theme.mp3** - Música épica del lobby (loop)
2. **battle_theme.mp3** - Música de tensión durante el juego (loop)

---

## 🎨 Recomendaciones de Estilo

Para que el juego se sienta **premium y profesional**, aquí algunas sugerencias de estilo para los sonidos:

### SFX
- **click.mp3**: Clic sutil y satisfactorio (tipo "botón de interfaz moderna")
- **countdown.mp3**: "TIC" metálico o electrónico que aumente la tensión
- **fight.mp3**: Grito épico de anunciador de combate (tipo "FIGHT!" de Mortal Kombat)
- **collision.mp3**: Impacto pesado, como dos objetos de metal chocando
- **win_round.mp3**: Fanfarria corta y victoriosa (2-3 segundos)
- **lose_round.mp3**: Efecto de derrota sutil (descenso tonal)
- **tie.mp3**: Sonido neutral o "empate" humorístico

### Voices
- **win_game.mp3**: Voz épica y grave: "VICTORYYYYYY!" (5-7 segundos)
- **lose_game.mp3**: Voz siniestra: "DEFEAT..." (con eco dramático)

### Music
- **menu_theme.mp3**: Música orquestal épica o electrónica ambient (loop perfecto)
- **battle_theme.mp3**: Música de tensión creciente, tipo soundtrack de combate

---

## 🔊 Configuración de Volumen

El sistema de audio ya está implementado con controles de volumen:
- **SFX**: Volumen ajustable (predeterminado: 50%)
- **Voces**: Volumen ajustable (predeterminado: 50%)
- **Música**: 60% del volumen principal (para no opacar el juego)

---

## 🚀 Próximos Pasos

1. **Descarga** los archivos de audio con los nombres exactos listados arriba
2. **Colócalos** en las carpetas correspondientes dentro de `public/sounds/`
3. **Prueba** el juego - ¡los sonidos se reproducirán automáticamente!

---

## 🎯 Recursos para Conseguir Sonidos

### Gratuitos (Uso Comercial)
- **Pixabay**: https://pixabay.com/sound-effects/
- **Freesound**: https://freesound.org/
- **Mixkit**: https://mixkit.co/free-sound-effects/

### Premium (Calidad Profesional)
- **Epidemic Sound**: https://www.epidemicsound.com/
- **AudioJungle**: https://audiojungle.net/
- **Zapsplat**: https://www.zapsplat.com/

---

✅ **Estado Actual**: El sistema de audio está 100% implementado y esperando los archivos.
