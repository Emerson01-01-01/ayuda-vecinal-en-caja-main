CREATE OR REPLACE FUNCTION public.load_demo_data()
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _store uuid := public.current_store_id();
  _today date := (now() AT TIME ZONE 'America/Guayaquil')::date;
  _ids uuid[];
  _pick uuid;
  _sale uuid; _purchase uuid; _supplier text;
  _p public.products%ROWTYPE;
  _ts timestamptz; _q integer; _t numeric(12,2); _c numeric(12,2); _pt numeric(12,2);
  d integer; s integer; k integer;
BEGIN
  IF _store IS NULL THEN RAISE EXCEPTION 'No se encontró tu tienda'; END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE store_id = _store) THEN
    RAISE EXCEPTION 'Tu tienda ya tiene productos. Los datos de demostración solo se cargan en una tienda vacía.';
  END IF;
  PERFORM set_config('app.skip_movement', 'on', true);

  INSERT INTO public.products(store_id, name, category, purchase_price, sale_price, quantity, min_stock, supplier) VALUES
    (_store, 'Gaseosa cola 500 ml', 'Bebidas', 0.55, 0.75, 36, 12, 'Distribuidora Andina'),
    (_store, 'Agua sin gas 600 ml', 'Bebidas', 0.30, 0.50, 40, 12, 'Distribuidora Andina'),
    (_store, 'Jugo de naranja 1 L', 'Bebidas', 1.10, 1.50, 10, 6, 'Distribuidora Andina'),
    (_store, 'Gaseosa 3 L', 'Bebidas', 2.10, 2.00, 8, 4, 'Distribuidora Andina'),
    (_store, 'Leche entera 1 L', 'Lácteos', 0.85, 1.05, 24, 10, 'Lácteos Chimborazo'),
    (_store, 'Yogur de mora 1 L', 'Lácteos', 1.60, 2.10, 4, 6, 'Lácteos Chimborazo'),
    (_store, 'Queso fresco 500 g', 'Lácteos', 2.30, 2.90, 6, 4, 'Lácteos Chimborazo'),
    (_store, 'Papas fritas 45 g', 'Snacks y golosinas', 0.35, 0.50, 30, 10, 'Snacks del Centro'),
    (_store, 'Galletas de chocolate', 'Snacks y golosinas', 0.25, 0.35, 0, 12, 'Snacks del Centro'),
    (_store, 'Caramelos surtidos (funda)', 'Snacks y golosinas', 0.80, 1.20, 10, 5, 'Snacks del Centro'),
    (_store, 'Arroz 1 kg', 'Abarrotes', 1.05, 1.25, 50, 15, 'Comercial Riobamba'),
    (_store, 'Azúcar 1 kg', 'Abarrotes', 0.95, 1.15, 20, 10, 'Comercial Riobamba'),
    (_store, 'Aceite vegetal 1 L', 'Abarrotes', 2.40, 2.75, 12, 6, 'Comercial Riobamba'),
    (_store, 'Fideo tallarín 400 g', 'Abarrotes', 0.70, 0.90, 25, 10, 'Comercial Riobamba'),
    (_store, 'Atún en lata 180 g', 'Abarrotes', 1.30, 1.60, 3, 8, 'Comercial Riobamba'),
    (_store, 'Salsa de tomate 400 g', 'Abarrotes', 1.50, 1.90, 14, 4, 'Comercial Riobamba'),
    (_store, 'Detergente en polvo 500 g', 'Productos de limpieza', 1.40, 1.75, 10, 5, 'Limpieza Total'),
    (_store, 'Cloro 1 L', 'Productos de limpieza', 0.60, 0.85, 8, 4, 'Limpieza Total'),
    (_store, 'Jabón de tocador', 'Higiene personal', 0.55, 0.80, 18, 6, 'Limpieza Total'),
    (_store, 'Papel higiénico x4', 'Higiene personal', 1.80, 1.95, 9, 6, 'Limpieza Total'),
    (_store, 'Pasta dental 75 ml', 'Higiene personal', 1.20, 1.60, 7, 4, 'Limpieza Total'),
    (_store, 'Huevos (unidad)', 'Productos básicos', 0.13, 0.17, 120, 30, 'Granja San Luis'),
    (_store, 'Sal 1 kg', 'Productos básicos', 0.40, 0.55, 15, 5, 'Comercial Riobamba'),
    (_store, 'Fósforos (paquete)', 'Productos básicos', 0.30, 0.50, 20, 5, 'Comercial Riobamba');

  SELECT array_agg(id) INTO _ids FROM public.products
    WHERE store_id = _store AND name NOT IN ('Salsa de tomate 400 g', 'Fósforos (paquete)');

  FOR d IN 0..13 LOOP
    FOR s IN 1..(4 + floor(random() * 6))::int LOOP
      IF d = 0 THEN
        _ts := now() - (random() * interval '5 hours');
      ELSE
        _ts := (((_today - d)::timestamp + interval '7 hours' + random() * interval '14 hours') AT TIME ZONE 'America/Guayaquil');
      END IF;
      INSERT INTO public.sales(store_id, sale_date, created_at, notes) VALUES (_store, _ts, _ts, 'Venta de demostración') RETURNING id INTO _sale;
      _t := 0; _c := 0;
      FOR k IN 1..(1 + floor(random() * 3))::int LOOP
        _pick := _ids[1 + floor(random() * array_length(_ids, 1))::int];
        SELECT * INTO _p FROM public.products WHERE id = _pick;
        _q := 1 + floor(random() * 3)::int;
        IF _p.name LIKE 'Huevos%' THEN _q := 6 + floor(random() * 7)::int; END IF;
        INSERT INTO public.sale_items(sale_id, store_id, product_id, product_name, category, quantity, unit_price, unit_cost, subtotal)
        VALUES (_sale, _store, _p.id, _p.name, _p.category, _q, _p.sale_price, _p.purchase_price, _p.sale_price * _q);
        INSERT INTO public.inventory_movements(store_id, product_id, product_name, movement_type, reason, quantity, reference_id, created_at)
        VALUES (_store, _p.id, _p.name, 'salida', 'venta', _q, _sale, _ts);
        _t := _t + _p.sale_price * _q; _c := _c + _p.purchase_price * _q;
      END LOOP;
      UPDATE public.sales SET total = _t, total_cost = _c WHERE id = _sale;
    END LOOP;
  END LOOP;

  FOR d IN 1..3 LOOP
    _supplier := CASE d WHEN 1 THEN 'Comercial Riobamba' WHEN 2 THEN 'Distribuidora Andina' ELSE 'Lácteos Chimborazo' END;
    INSERT INTO public.purchases(store_id, purchase_date, supplier, notes, created_at)
    VALUES (_store, _today - (d * 4), _supplier, 'Compra de demostración', now() - (d * 4) * interval '1 day')
    RETURNING id INTO _purchase;
    _pt := 0;
    FOR _p IN SELECT * FROM public.products WHERE store_id = _store AND supplier = _supplier ORDER BY name LIMIT 4 LOOP
      _q := 6 + floor(random() * 12)::int;
      INSERT INTO public.purchase_items(purchase_id, store_id, product_id, product_name, quantity, unit_cost, subtotal)
      VALUES (_purchase, _store, _p.id, _p.name, _q, _p.purchase_price, _p.purchase_price * _q);
      INSERT INTO public.inventory_movements(store_id, product_id, product_name, movement_type, reason, quantity, reference_id, created_at)
      VALUES (_store, _p.id, _p.name, 'entrada', 'compra', _q, _purchase, now() - (d * 4) * interval '1 day');
      _pt := _pt + _p.purchase_price * _q;
    END LOOP;
    UPDATE public.purchases SET total = _pt WHERE id = _purchase;
  END LOOP;

  INSERT INTO public.expenses(store_id, description, category, amount, expense_date, notes) VALUES
    (_store, 'Arriendo del local', 'Arriendo', 180.00, _today - 20, 'Dato de demostración'),
    (_store, 'Planilla de luz', 'Servicios básicos', 18.40, _today - 12, 'Dato de demostración'),
    (_store, 'Planilla de agua', 'Servicios básicos', 7.90, _today - 11, 'Dato de demostración'),
    (_store, 'Internet y teléfono', 'Servicios básicos', 22.00, _today - 9, 'Dato de demostración'),
    (_store, 'Taxi para traer mercadería', 'Transporte', 4.50, _today - 8, 'Dato de demostración'),
    (_store, 'Flete desde el mercado La Condamine', 'Transporte', 6.00, _today - 4, 'Dato de demostración'),
    (_store, 'Arreglo de la refrigeradora', 'Mantenimiento', 25.00, _today - 6, 'Dato de demostración'),
    (_store, 'Fundas y material de empaque', 'Otros gastos operativos', 5.20, _today - 2, 'Dato de demostración'),
    (_store, 'Transporte a proveedor', 'Transporte', 3.50, _today, 'Dato de demostración');

  UPDATE public.stores SET has_demo_data = true WHERE id = _store;
  PERFORM set_config('app.skip_movement', 'off', true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.load_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_demo_data() TO authenticated;