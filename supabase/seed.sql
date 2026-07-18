insert into public.categories(name, sort_order, is_active) values
  ('野菜', 1, true),
  ('肉', 2, true),
  ('日用品', 3, true),
  ('グロサリ(粉)', 4, true),
  ('冷蔵', 5, true),
  ('グロサリ', 6, true),
  ('グロサリ(油)', 7, true),
  ('グロサリ(調味料)', 8, true),
  ('グロサリ(ドリンク)', 9, true),
  ('グロサリ(麺)', 10, true),
  ('グロサリ(素)', 11, true),
  ('魚', 12, true),
  ('冷凍食品', 13, true)
on conflict (name) do update set sort_order = excluded.sort_order, is_active = excluded.is_active;

insert into public.stores(name, sort_order, is_active) values
  ('業務スーパー', 1, true),
  ('コープ', 2, true),
  ('ロピア', 3, true),
  ('ネット', 4, true),
  ('薬局', 5, true),
  ('100均', 6, true),
  ('スーパー', 7, true)
on conflict (name) do update set sort_order = excluded.sort_order, is_active = excluded.is_active;

insert into public.products(name, category_id, store_id, memo, is_selected, sort_order)
select v.name, c.id, s.id, nullif(v.memo, ''), v.is_selected, v.sort_order
from (
  values
    ('スーパー', '野菜', 'フルーツ', true, '', 1),
    ('100均', '日用品', 'ウェッティー', true, '', 1),
    ('スーパー', '日用品', 'ティッシュ', true, '', 2),
    ('スーパー', '日用品', '液体ハイター', true, '', 3),
    ('ネット', '日用品', '燃えるゴミ袋', true, '', 4),
    ('業務スーパー', '冷蔵', '牛乳', true, '', 1),
    ('スーパー', '冷蔵', '焼きそば', true, '', 2),
    ('スーパー', '冷蔵', '納豆', true, '', 3),
    ('業務スーパー', 'グロサリ', '味噌汁', true, '', 1),
    ('業務スーパー', 'グロサリ(麺)', 'サリ麺', true, '', 1),
    ('ロピア', '魚', 'エビ', true, '', 1),
    ('コープ', '魚', '魚', true, '', 2),
    ('業務スーパー', '冷凍食品', '枝豆', true, '', 1)
) as v(store_name, category_name, name, is_selected, memo, sort_order)
join public.categories c on c.name = v.category_name
join public.stores s on s.name = v.store_name
where not exists (
  select 1
  from public.products p
  where p.name = v.name and p.category_id = c.id and p.store_id = s.id
);
