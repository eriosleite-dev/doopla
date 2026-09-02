import { useFonts } from 'expo-font';
import { Anton_400Regular } from '@expo-google-fonts/anton';
import { FamiljenGrotesk_500Medium, FamiljenGrotesk_600SemiBold, FamiljenGrotesk_700Bold } from '@expo-google-fonts/familjen-grotesk';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';

// Tipografia do layout aprovado: Anton (display/números), Familjen
// Grotesk (títulos/subtítulos), Inter (corpo), IBM Plex Mono (labels
// técnicos/valores/horários) — mesmas 4 famílias do protótipo HTML,
// carregadas via @expo-google-fonts (self-hosted no bundle do app,
// nunca via <link> de Google Fonts como no protótipo web).
export function useAppFonts() {
  const [loaded, error] = useFonts({
    Anton_400Regular,
    FamiljenGrotesk_500Medium,
    FamiljenGrotesk_600SemiBold,
    FamiljenGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexMono_500Medium,
  });

  return { fontsLoaded: loaded, fontsError: error };
}
