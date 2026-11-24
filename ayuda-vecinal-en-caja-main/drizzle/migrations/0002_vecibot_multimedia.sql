-- Owner JWT + RLS throughout. No service role or SECURITY DEFINER.
CREATE TABLE public.vecibot_action_receipts (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  action jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, request_id)
);
ALTER TABLE public.vecibot_action_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_receipts ON public.vecibot_action_receipts
  FOR ALL TO authenticated
  USING (public.is_store_owner(store_id))
  WITH CHECK (public.is_store_owner(store_id));
REVOKE ALL ON public.vecibot_action_receipts FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.vecibot_action_receipts TO authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.apply_vecibot_action(_request_id uuid, _action jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_store uuid := public.current_store_id();
  v_intent text := _action->>'intent';
  v_items jsonb;
  v_item jsonb;
  v_saved_action jsonb;
  v_result jsonb;
  v_id uuid;
  v_ids jsonb := '[]'::jsonb;
  v_price numeric;
  v_key text;
  v_message text;
BEGIN
  IF auth.uid() IS NULL OR v_store IS NULL OR NOT public.is_store_owner(v_store) THEN
    RAISE EXCEPTION 'Tienda no autorizada' USING ERRCODE = '42501';
  END IF;
  IF _request_id IS NULL OR jsonb_typeof(_action) IS DISTINCT FROM 'object'
    OR v_intent IS NULL OR v_intent NOT IN ('venta', 'compra', 'producto') THEN
    RAISE EXCEPTION 'Acción no válida' USING ERRCODE = '22023';
  END IF;

  -- Concurrent retries wait on the same receipt. Everything rolls back on failure.
  INSERT INTO public.vecibot_action_receipts(store_id, request_id, action)
    VALUES (v_store, _request_id, _action) ON CONFLICT DO NOTHING;
  SELECT action, result INTO v_saved_action, v_result
    FROM public.vecibot_action_receipts
    WHERE store_id = v_store AND request_id = _request_id FOR UPDATE;
  IF v_saved_action IS DISTINCT FROM _action THEN
    RAISE EXCEPTION 'Esta entrada ya se usó con otros datos' USING ERRCODE = '22023';
  END IF;
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;

  v_items := CASE WHEN v_intent = 'producto' THEN _action->'products' ELSE _action->'items' END;
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Faltan productos' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Revisa el número de productos' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
      OR COALESCE(v_item->>'quantity', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Cantidad entera requerida' USING ERRCODE = '22023';
    END IF;
    IF (v_item->>'quantity')::numeric > 1000000
      OR (v_intent <> 'producto' AND (v_item->>'quantity')::numeric < 1) THEN
      RAISE EXCEPTION 'Cantidad fuera de rango' USING ERRCODE = '22023';
    END IF;
    IF v_intent <> 'producto' THEN
      IF NOT EXISTS (SELECT 1 FROM public.products
        WHERE id = (v_item->>'product_id')::uuid AND store_id = v_store) THEN
        RAISE EXCEPTION 'Producto no autorizado' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF v_intent IN ('compra', 'producto') THEN
      FOREACH v_key IN ARRAY CASE WHEN v_intent = 'compra' THEN ARRAY['unit_cost']
        ELSE ARRAY['purchase_price', 'sale_price'] END LOOP
        IF jsonb_typeof(v_item->v_key) IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION 'Precio requerido' USING ERRCODE = '22023';
        END IF;
        v_price := (v_item->>v_key)::numeric;
        IF v_price < 0 OR v_price > 100000 THEN
          RAISE EXCEPTION 'Precio fuera de rango' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;
    IF v_intent = 'producto' THEN
      IF jsonb_typeof(v_item->'name') IS DISTINCT FROM 'string'
        OR length(btrim(v_item->>'name')) NOT BETWEEN 1 AND 120
        OR COALESCE(v_item->>'category', '') NOT IN ('Bebidas', 'Lácteos', 'Snacks y golosinas',
          'Abarrotes', 'Productos de limpieza', 'Higiene personal', 'Productos básicos')
        OR jsonb_typeof(v_item->'min_stock') IS DISTINCT FROM 'number'
        OR COALESCE(v_item->>'min_stock', '') !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Revisa el producto, categoría y stock mínimo' USING ERRCODE = '22023';
      END IF;
      IF (v_item->>'min_stock')::numeric > 100000
        OR length(COALESCE(v_item->>'supplier', '')) > 120 THEN
        RAISE EXCEPTION 'Datos fuera de rango' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.products
        WHERE store_id = v_store AND lower(btrim(name)) = lower(btrim(v_item->>'name'))) THEN
        RAISE EXCEPTION 'El producto ya existe. Usa Compras para reponerlo' USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.products(store_id, name, category, purchase_price, sale_price, quantity, min_stock, supplier)
        VALUES (v_store, btrim(v_item->>'name'), v_item->>'category', (v_item->>'purchase_price')::numeric,
          (v_item->>'sale_price')::numeric, (v_item->>'quantity')::integer,
          (v_item->>'min_stock')::integer, NULLIF(btrim(v_item->>'supplier'), '')) RETURNING id INTO v_id;
      v_ids := v_ids || jsonb_build_array(v_id);
    END IF;
  END LOOP;

  IF v_intent <> 'producto' AND (SELECT count(*) <> count(DISTINCT value->>'product_id') FROM jsonb_array_elements(v_items)) THEN
    RAISE EXCEPTION 'Productos repetidos' USING ERRCODE = '22023';
  END IF;
  IF v_intent = 'venta' THEN
    v_id := public.register_sale(_items => v_items, _notes => 'Registrado con VeciBot');
    v_message := 'Venta registrada con VeciBot. Inventario actualizado.';
  ELSIF v_intent = 'compra' THEN
    IF COALESCE(_action->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (_action->>'date')::date > (now() AT TIME ZONE 'America/Guayaquil')::date
      OR length(COALESCE(_action->>'supplier', '')) > 120 THEN
      RAISE EXCEPTION 'Fecha o proveedor no válido' USING ERRCODE = '22023';
    END IF;
    v_id := public.register_purchase(_items => v_items, _purchase_date => (_action->>'date')::date,
      _supplier => NULLIF(btrim(_action->>'supplier'), ''), _update_cost => true, _notes => 'Registrado con VeciBot');
    v_message := 'Compra registrada con VeciBot. Existencias y costos actualizados.';
  ELSE
    v_message := 'Productos agregados al catálogo con VeciBot.';
  END IF;
  v_result := jsonb_build_object('intent', v_intent, 'id', v_id, 'product_ids', v_ids, 'message', v_message);
  INSERT INTO public.chat_messages(store_id, role, content) VALUES (v_store, 'assistant', v_message);
  UPDATE public.vecibot_action_receipts SET result = v_result
    WHERE store_id = v_store AND request_id = _request_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_vecibot_action(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_vecibot_action(uuid, jsonb) TO authenticated;
