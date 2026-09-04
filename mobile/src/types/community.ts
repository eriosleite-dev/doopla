// Espelha a seção "Comunidade" de src/lib/supabase/types.ts (painel
// web) — mesma migration (0059), cópia deliberada.

export type CommunityVisibilityStatus = 'active' | 'restricted' | 'blocked';

export type CommunityProfile = {
  profile_id: string;
  visibility_status: CommunityVisibilityStatus;
  available_for_referrals: boolean;
  show_city: boolean;
  show_avatar: boolean;
  show_bio: boolean;
  show_specialties: boolean;
  show_work_types: boolean;
  show_instagram: boolean;
  show_portfolio: boolean;
  activated_at: string;
  updated_at: string;
};

export type CommunityProfilePublic = {
  profile_id: string;
  display_name: string;
  profession_label: string | null;
  profession_id: string | null;
  is_pro: boolean;
  available_for_referrals: boolean;
  is_incomplete: boolean;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[] | null;
  work_types: string[] | null;
  instagram_url: string | null;
  portfolio_url: string | null;
};

export type CommunityCategory = {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  active: boolean;
};

export type CommunityTag = {
  id: string;
  slug: string;
  label: string;
  active: boolean;
};

export type CommunityTopicAudience = 'niche' | 'all';
export type CommunityContentStatus = 'published' | 'removed_by_author' | 'removed_by_moderator';

export type CommunityTopic = {
  id: string;
  author_profile_id: string;
  title: string;
  body: string;
  category_id: string;
  audience: CommunityTopicAudience;
  status: CommunityContentStatus;
  reply_count: number;
  participant_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

export type CommunityPost = {
  id: string;
  topic_id: string;
  author_profile_id: string;
  body: string;
  reply_to_post_id: string | null;
  status: CommunityContentStatus;
  created_at: string;
  updated_at: string;
};

export type CommunityNotificationType = 'reply_to_topic' | 'reply_to_post' | 'mention';

export type CommunityNotification = {
  id: string;
  recipient_profile_id: string;
  actor_profile_id: string;
  type: CommunityNotificationType;
  topic_id: string;
  post_id: string | null;
  read_at: string | null;
  created_at: string;
};
