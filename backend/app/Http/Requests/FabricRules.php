<?php

namespace App\Http\Requests;

use App\Models\Fabric;
use Illuminate\Validation\Rule;

/** Validation for fabric fields, shared by the fabric form and the "new fabric" part of roll receiving. */
final class FabricRules
{
    /** @return array<string, mixed> */
    public static function rules(string $prefix = '', ?Fabric $existing = null): array
    {
        return [
            $prefix.'code' => ['nullable', 'string', 'max:30', Rule::unique('fabrics', 'code')->ignore($existing)],
            $prefix.'fabric_category_id' => ['required', 'integer', 'exists:fabric_categories,id'],
            $prefix.'material_type_id' => ['required', 'integer', 'exists:material_types,id'],
            $prefix.'texture_id' => ['required', 'integer', 'exists:textures,id'],
            $prefix.'colour_id' => ['required', 'integer', 'exists:colours,id'],
            $prefix.'design' => ['nullable', 'string', 'max:100'],
            $prefix.'shade_code' => ['nullable', 'string', 'max:50'],
            $prefix.'opacity' => ['nullable', Rule::in(Fabric::OPACITIES)],
            $prefix.'width_cm' => ['nullable', 'integer', 'min:1', 'max:1000'],
            $prefix.'weight_gsm' => ['nullable', 'integer', 'min:1', 'max:5000'],
            $prefix.'care_instructions' => ['nullable', 'string', 'max:500'],
            $prefix.'retail_price_cents_per_m' => ['nullable', 'integer', 'min:0', 'max:100000000'],
            $prefix.'reorder_threshold_cm' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ];
    }

    /**
     * Turn validated input into model attributes (nullable text becomes '').
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function attributes(array $data): array
    {
        foreach (['design', 'shade_code', 'opacity', 'care_instructions'] as $text) {
            $data[$text] = trim((string) ($data[$text] ?? ''));
        }
        if (empty($data['code'])) {
            unset($data['code']);
        } else {
            $data['code'] = strtoupper(trim($data['code']));
        }

        return $data;
    }
}
