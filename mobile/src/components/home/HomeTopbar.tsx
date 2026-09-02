import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
import { IconButton } from '@/components/shared/IconButton';
import { BellIcon, ForumPeopleIcon } from '@/components/icons/Icons';

// Logo: o protótipo usa um PNG gerado em baixa escala só pra
// prototipagem (ver dooplapromptcodehomedark.md). Até recebermos o
// arquivo fonte oficial (.png transparente, variante dark), uso um
// wordmark textual como placeholder — nunca a versão de baixa
// qualidade do protótipo.
function LogoPlaceholder() {
  return (
    <Text style={styles.logoText}>
      D<Text style={styles.logoDot}>o</Text>opla
    </Text>
  );
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
    color: colors.off,
    fontFamily: fonts.subBold,
    fontSize: 16,
  },
  logoDot: {
    color: colors.red,
  },
  icons: {
    flexDirection: 'row',
    gap: 8,
  },
});
