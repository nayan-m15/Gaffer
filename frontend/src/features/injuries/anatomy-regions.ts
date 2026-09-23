import type { BodyRegion } from "./types";

/**
 * Maps each coach-facing {@link BodyRegion} to the mesh names inside
 * `public/models/anatomy.glb` that make it up.
 *
 * The model is a full anatomical atlas (BodyParts3D + Z-Anatomy, see
 * `mesh_mapping.json`) — hundreds of individually named muscles/tendons, far
 * more granular than the app's region vocabulary. This is deliberately a
 * many-to-many mapping, not a partition: a muscle like supraspinatus reads
 * as both "shoulder" and "upper back" depending on which region a coach is
 * logging, so it's listed under both. Names must match `mesh_mapping.json`
 * exactly; BodyModelViewer warns in dev if a mapped name isn't found in the
 * loaded model.
 */
export const REGION_TO_MESH_NAMES: Record<BodyRegion, readonly string[]> = {
  /* No mesh here: the thin, skull-adjacent facial/jaw/eye/laryngeal muscles
   * that would otherwise stand in for a head (HEAD_HIDDEN_MESH_NAMES below)
   * read as a bare skull with no skin over them, so they're hidden and
   * `public/models/head.glb` — a sculpted head-and-eyes mesh — is fitted
   * into the gap instead. BodyModelViewer registers that model's own head
   * mesh for the "head" region directly, not through this table. */
  head: [],

  neck: [
    "left sternocleidomastoid",
    "right sternocleidomastoid",
    "left splenius capitis",
    "right splenius capitis",
    "left splenius cervicis",
    "right splenius cervicis",
    "left scalenus anterior",
    "right scalenus anterior",
    "left scalenus medius",
    "right scalenus medius",
    "left scalenus posterior",
    "right scalenus posterior",
  ],

  chest: [
    "abdominal part of left pectoralis major",
    "abdominal part of right pectoralis major",
    "clavicular part of left pectoralis major",
    "clavicular part of right pectoralis major",
    "sternocostal part of left pectoralis major",
    "sternocostal part of right pectoralis major",
    "left pectoralis minor",
    "right pectoralis minor",
  ],

  abdomen: [
    "left rectus abdominis",
    "right rectus abdominis",
    "left external oblique",
    "right external oblique",
    "left internal oblique",
    "right internal oblique",
    "left transversus abdominis",
    "right transversus abdominis",
  ],

  groin: [
    "left adductor longus",
    "right adductor longus",
    "left adductor brevis",
    "right adductor brevis",
    "left adductor magnus",
    "right adductor magnus",
    "left adductor minimus",
    "right adductor minimus",
    "left pectineus",
    "right pectineus",
    "left gracilis",
    "right gracilis",
  ],

  back_upper: [
    "ascending part of left trapezius",
    "ascending part of right trapezius",
    "descending part of left trapezius",
    "descending part of right trapezius",
    "transverse part of left trapezius",
    "transverse part of right trapezius",
    "left rhomboid major",
    "right rhomboid major",
    "left rhomboid minor",
    "right rhomboid minor",
    "left infraspinatus muscle",
    "right infraspinatus muscle",
    "left supraspinatus",
    "right supraspinatus",
    "left teres major",
    "right teres major",
    "left teres minor",
    "right teres minor",
    "left latissimus dorsi",
    "right latissimus dorsi",
    "left serratus posterior superior",
    "right serratus posterior superior",
    "left levator scapulae",
    "right levator scapulae",
  ],

  back_lower: [
    "left iliocostalis lumborum",
    "right iliocostalis lumborum",
    "left iliocostalis thoracis",
    "right iliocostalis thoracis",
    "left longissimus thoracis",
    "right longissimus thoracis",
    "left spinalis thoracis",
    "right spinalis thoracis",
    "spinalis",
    "left quadratus lumborum",
    "right quadratus lumborum",
    "left multifidus lumborum",
    "right multifidus lumborum",
    "left serratus posterior inferior",
    "right serratus posterior inferior",
    "left anterior layer of thoracolumbar fascia",
    "right anterior layer of thoracolumbar fascia",
    "left middle layer of thoracolumbar fascia",
    "right middle layer of thoracolumbar fascia",
    "left posterior layer of thoracolumbar fascia",
    "right posterior layer of thoracolumbar fascia",
  ],

  glute_left: [
    "left gluteus maximus",
    "left gluteus medius",
    "left gluteus minimus",
    "left piriformis",
    "left obturator internus",
    "left obturator externus",
    "left gemellus inferior",
    "left gemellus superior",
    "left quadratus femoris",
  ],
  glute_right: [
    "right gluteus maximus",
    "right gluteus medius",
    "right gluteus minimus",
    "right piriformis",
    "right obturator internus",
    "right obturator externus",
    "right gemellus inferior",
    "right gemellus superior",
    "right quadratus femoris",
  ],

  shoulder_left: [
    "acromial part of left deltoid",
    "clavicular part of left deltoid",
    "spinal part of left deltoid",
    "left supraspinatus",
    "left infraspinatus muscle",
    "left teres minor",
    "left subscapularis",
  ],
  shoulder_right: [
    "acromial part of right deltoid",
    "clavicular part of right deltoid",
    "spinal part of right deltoid",
    "right supraspinatus",
    "right infraspinatus muscle",
    "right teres minor",
    "right subscapularis",
  ],

  upper_arm_left: [
    "long head of left biceps brachii",
    "short head of left biceps brachii",
    "left brachialis",
    "left coracobrachialis",
    "long head of left triceps brachii",
    "lateral head of left triceps brachii",
    "medial head of left triceps brachii",
  ],
  upper_arm_right: [
    "long head of right biceps brachii",
    "short head of right biceps brachii",
    "right brachialis",
    "right coracobrachialis",
    "long head of right triceps brachii",
    "lateral head of right triceps brachii",
    "medial head of right triceps brachii",
  ],

  forearm_left: [
    "left brachioradialis",
    "left extensor carpi radialis brevis",
    "left extensor carpi radialis longus",
    "left extensor carpi ulnaris",
    "left extensor carpi ulnaris (2)",
    "left extensor digitorum",
    "left extensor digiti minimi",
    "left flexor carpi radialis",
    "humeral head of left flexor carpi ulnaris",
    "ulnar head of left flexor carpi ulnaris",
    "left flexor digitorum superficialis",
    "left flexor digitorum superficialis (2)",
    "left flexor digitorum profundus",
    "humeral head of left pronator teres",
    "ulnar head of left pronator teres",
    "left pronator quadratus",
    "left supinator",
    "left palmaris longus",
    "left extensor pollicis brevis",
    "left extensor pollicis longus",
    "left extensor indicis",
    "left abductor pollicis longus",
    "left flexor pollicis longus",
    "left anconeus",
  ],
  forearm_right: [
    "right brachioradialis",
    "right extensor carpi radialis brevis",
    "right extensor carpi radialis longus",
    "right extensor carpi ulnaris",
    "right extensor carpi ulnaris (2)",
    "right extensor digitorum",
    "right extensor digiti minimi",
    "right flexor carpi radialis",
    "humeral head of right flexor carpi ulnaris",
    "ulnar head of right flexor carpi ulnaris",
    "right flexor digitorum superficialis",
    "right flexor digitorum superficialis (2)",
    "right flexor digitorum profundus",
    "humeral head of right pronator teres",
    "ulnar head of right pronator teres",
    "right pronator quadratus",
    "right supinator",
    "right palmaris longus",
    "right extensor pollicis brevis",
    "right extensor pollicis longus",
    "right extensor indicis",
    "right abductor pollicis longus",
    "right flexor pollicis longus",
    "right anconeus",
  ],

  wrist_hand_left: [
    "left abductor pollicis brevis",
    "left flexor pollicis brevis",
    "superficial head of left flexor pollicis brevis",
    "left opponens pollicis",
    "oblique head of left adductor pollicis",
    "transverse head of left adductor pollicis",
    "abductor digiti minimi of left hand",
    "flexor digiti minimi brevis of left hand",
    "opponens digiti minimi of left hand",
    "set of dorsal interossei of left hand",
    "set of palmar interossei of left hand",
    "set of lumbricals of left hand",
    "flexor retinaculum of left wrist",
  ],
  wrist_hand_right: [
    "right abductor pollicis brevis",
    "right flexor pollicis brevis",
    "superficial head of right flexor pollicis brevis",
    "right opponens pollicis",
    "oblique head of right adductor pollicis",
    "transverse head of right adductor pollicis",
    "abductor digiti minimi of right hand",
    "flexor digiti minimi brevis of right hand",
    "opponens digiti minimi of right hand",
    "set of dorsal interossei of right hand",
    "set of palmar interossei of right hand",
    "set of lumbricals of right hand",
    "flexor retinaculum of right wrist",
  ],

  quad_left: [
    "left rectus femoris",
    "left vastus lateralis",
    "left vastus medialis",
    "left vastus intermedius",
  ],
  quad_right: [
    "right rectus femoris",
    "right vastus lateralis",
    "right vastus medialis",
    "right vastus intermedius",
  ],

  hamstring_left: [
    "long head of left biceps femoris",
    "short head of left biceps femoris",
    "left semitendinosus",
    "left semimembranosus",
  ],
  hamstring_right: [
    "long head of right biceps femoris",
    "short head of right biceps femoris",
    "right semitendinosus",
    "right semimembranosus",
  ],

  knee_left: ["left popliteus"],
  knee_right: ["right popliteus"],

  calf_left: [
    "medial head of left gastrocnemius",
    "lateral head of left gastrocnemius",
    "left soleus",
    "left plantaris",
  ],
  calf_right: [
    "medial head of right gastrocnemius",
    "lateral head of right gastrocnemius",
    "right soleus",
    "right plantaris",
  ],

  achilles_left: ["left calcaneal tendon"],
  achilles_right: ["right calcaneal tendon"],

  ankle_left: [
    "left tibialis anterior",
    "left tibialis posterior",
    "left fibularis brevis",
    "left fibularis longus",
    "left fibularis tertius",
  ],
  ankle_right: [
    "right tibialis anterior",
    "right tibialis posterior",
    "right fibularis brevis",
    "right fibularis longus",
    "right fibularis tertius",
  ],

  foot_left: [
    "left abductor hallucis",
    "left flexor digitorum brevis",
    "left flexor accessorius",
    "lateral head of left flexor hallucis brevis",
    "medial head of left flexor hallucis brevis",
    "oblique head of left adductor hallucis",
    "transverse head of left adductor hallucis",
    "left extensor digitorum longus",
    "left extensor hallucis longus",
    "left extensor hallucis brevis",
    "left flexor hallucis longus",
    "left flexor digitorum longus",
    "first lumbrical of left foot",
    "second lumbrical of left foot",
    "third lumbrical of left foot",
    "fourth lumbrical of left foot",
    "first plantar interosseous of left foot",
    "second plantar interosseous of left foot",
    "third plantar interosseous of left foot",
    "abductor digiti minimi of left foot",
    "flexor digiti minimi brevis of left foot",
    "opponens digiti minimi of left foot",
  ],
  foot_right: [
    "right abductor hallucis",
    "right flexor digitorum brevis",
    "right flexor accessorius",
    "lateral head of right flexor hallucis brevis",
    "medial head of right flexor hallucis brevis",
    "oblique head of right adductor hallucis",
    "transverse head of right adductor hallucis",
    "right extensor digitorum longus",
    "right extensor hallucis longus",
    "right extensor hallucis brevis",
    "right flexor hallucis longus",
    "right flexor digitorum longus",
    "first lumbrical of right foot",
    "second lumbrical of right foot",
    "third lumbrical of right foot",
    "fourth lumbrical of right foot",
    "first plantar interosseous of right foot",
    "second plantar interosseous of right foot",
    "third plantar interosseous of right foot",
    "abductor digiti minimi of right foot",
    "flexor digiti minimi brevis of right foot",
    "opponens digiti minimi of right foot",
  ],
};

/** Every mesh name mapped, for validating against the actual model file. */
export const ALL_MAPPED_MESH_NAMES: readonly string[] = Array.from(
  new Set(Object.values(REGION_TO_MESH_NAMES).flat()),
);

/**
 * Matches `THREE.PropertyBinding.sanitizeNodeName`, which GLTFLoader runs on
 * every node/mesh name so it's safe to use in an animation-track path: this
 * model has no `[`, `]`, `.`, `:` or `/` in its names, so the only change in
 * practice is spaces becoming underscores (e.g. "left biceps femoris" ->
 * "left_biceps_femoris"). The keys below are normalised the same way so a
 * lookup by `mesh.name` — already sanitized by the loader — matches directly.
 */
function sanitizeMeshName(name: string): string {
  return name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");
}

/**
 * The thin, skull-adjacent facial, jaw, extraocular and laryngeal muscles
 * that, without a skin layer over them, read as a bare skull rather than a
 * face — masseter, the orbicularis/zygomaticus/frontalis group, the eye
 * muscles, the pterygoids, the hyoid strap muscles, the suboccipital and
 * deep anterior-neck muscles, and the laryngeal cartilage/muscle group.
 * BodyModelViewer skips these entirely and fits `head.glb` into the gap
 * instead, sized from their own combined bounding box.
 */
const HEAD_HIDDEN_MESH_NAMES_RAW: readonly string[] = [
  "left frontalis",
  "right frontalis",
  "left temporalis",
  "right temporalis",
  "left deep part of masseter",
  "right deep part of masseter",
  "left superficial part of masseter",
  "right superficial part of masseter",
  "left corrugator supercilii",
  "right corrugator supercilii",
  "left depressor anguli oris",
  "right depressor anguli oris",
  "left depressor labii inferioris",
  "right depressor labii inferioris",
  "left levator labii superioris",
  "right levator labii superioris",
  "left mentalis",
  "right mentalis",
  "left nasalis",
  "right nasalis",
  "left orbicularis oris",
  "right orbicularis oris",
  "left orbital part of orbicularis oculi",
  "right orbital part of orbicularis oculi",
  "left palpebral part of orbicularis oculi",
  "right palpebral part of orbicularis oculi",
  "left platysma",
  "right platysma",
  "left procerus",
  "right procerus",
  "left risorius",
  "right risorius",
  "left zygomaticus major",
  "right zygomaticus major",
  "left zygomaticus minor",
  "right zygomaticus minor",
  "left digastric",
  "left digastric (2)",
  "left digastric (3)",
  "right digastric",
  "right digastric (2)",
  "left geniohyoid",
  "right geniohyoid",
  "left mylohyoid",
  "right mylohyoid",
  "left stylohyoid",
  "right stylohyoid",
  "left omohyoid",
  "right omohyoid",
  "left sternohyoid",
  "right sternohyoid",
  "left sternothyroid",
  "right sternothyroid",
  "left thyrohyoid",
  "right thyrohyoid",
  "left inferior head of lateral pterygoid",
  "right inferior head of lateral pterygoid",
  "left superior head of lateral pterygoid",
  "right superior head of lateral pterygoid",
  "left medial pterygoid",
  "right medial pterygoid",
  "left levator palpebrae superioris",
  "right levator palpebrae superioris",
  "tendon of right levator palpebrae superioris",
  "left inferior oblique",
  "right inferior oblique",
  "left inferior rectus",
  "right inferior rectus",
  "left lateral rectus",
  "right lateral rectus",
  "left medial rectus",
  "right medial rectus",
  "left superior oblique",
  "right superior oblique",
  "left superior rectus",
  "right superior rectus",
  "left arytenoid cartilage",
  "right arytenoid cartilage",
  "left lateral crico-arytenoid",
  "right lateral crico-arytenoid",
  "left oblique arytenoid",
  "right oblique arytenoid",
  "left posterior crico-arytenoid",
  "right posterior crico-arytenoid",
  "left thyro-arytenoid",
  "left thyro-arytenoid (2)",
  "right thyro-arytenoid",
  "right thyro-arytenoid (2)",
  "transverse arytenoid",
  "median cricothyroid ligament",
  "oblique part of left cricothyroid",
  "oblique part of right cricothyroid",
  "straight part of left cricothyroid",
  "straight part of right cricothyroid",
  "left tensor veli palatini",
  "right tensor veli palatini",
  "left levator veli palatini",
  "right levator veli palatini",
  "left longus capitis",
  "right longus capitis",
  "inferior oblique part of left longus colli",
  "superior oblique part of left longus colli",
  "vertical intermediate part of left longus colli",
  "left rectus capitis anterior",
  "right rectus capitis anterior",
  "left rectus capitis lateralis",
  "right rectus capitis lateralis",
  "left rectus capitis posterior major",
  "right rectus capitis posterior major",
  "left rectus capitis posterior minor",
  "right rectus capitis posterior minor",
];

export const HEAD_HIDDEN_MESH_NAMES: ReadonlySet<string> = new Set(
  HEAD_HIDDEN_MESH_NAMES_RAW.map(sanitizeMeshName),
);

/** Reverse lookup built from the table above: mesh name -> owning regions. */
export const MESH_NAME_TO_REGIONS: ReadonlyMap<string, readonly BodyRegion[]> =
  (() => {
    const map = new Map<string, BodyRegion[]>();
    for (const [region, names] of Object.entries(REGION_TO_MESH_NAMES) as Array<
      [BodyRegion, readonly string[]]
    >) {
      for (const name of names) {
        const key = sanitizeMeshName(name);
        const existing = map.get(key);
        if (existing) {
          existing.push(region);
        } else {
          map.set(key, [region]);
        }
      }
    }
    return map;
  })();
