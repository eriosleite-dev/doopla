import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { IconButton } from '@/components/shared/IconButton';
import { BellIcon, ForumPeopleIcon } from '@/components/icons/Icons';

// Nenhum asset de logo oficial reutilizável existe no repositório
// (auditado 04/09/2026: mobile/assets/ só tem ícones default do Expo,
// nunca customizados pra marca Doopla). Por instrução explícita
// (review 04/09/2026): nunca desenhar um wordmark novo pra substituir
// isso — a versão anterior deste componente estilizava o "o" como um
// ponto colorido, imitando a geometria dos olhos do logo real, o que
// já era um wordmark inventado. Tratamento honesto temporário: texto
// simples, sem tipografia/cor de marca. Pendência de asset real
// registrada no relatório final.
function LogoPlaceholder() {
  return <Text style={styles.logoText}>doopla</Text>;
}

export function HomeTopbar({
  notificationsCount,
  forumHasNew,
  onOpenForum,
}: {
  notificationsCount: number;
  forumHasNew: boolean;
  onOpenForum: () => void;
}) {
  return (
    <View style={styles.bar}>
      <LogoPlaceholder />
      <View style={styles.icons}>
        <IconButton badge={notificationsCount > 0 ? { kind: 'count', value: notificationsCount } : undefined}>
          <BellIcon size={15} color={colors.tx70} />
        </IconButton>
        <IconButton badge={forumHasNew ? { kind: 'dot' } : undefined} onPress={onOpenForum}>
          <ForumPeopleIcon size={15} color={colors.tx70} />
        </IconButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  logoText: {
    color: colors.tx50,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  icons: {
    flexDirection: 'row',
    gap: 8,
  },
});
