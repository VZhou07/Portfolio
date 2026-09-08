/* ============================================================================
   RECOVERED TEACH / REPEAT FLIGHT FRAMES
   ----------------------------------------------------------------------------
   GENERATED — do not hand-edit. Produced by tmp/export_frames.py from the 12
   unique overlay frames recovered off the flight card.

   Every number here was measured from the frames themselves:

   * errCm is EXACT. The flight software drew the correction arrow at
     250 px per metre (arrow_scale = min(250, 100/max(|tx|,|ty|)) in
     airside/src/nodes/nodes/processor.py), so any arrow short of its 100 px
     clamp inverts losslessly back to metres. clamped=true means the true error
     was past 0.40 m and only its direction survived.

   * relAlt / relTeachAlt are MEASURED, not absolute. The overlay filenames
     carried the altitude and the recovery destroyed them, so altitude is
     recovered from the similarity scale between every pair of surviving halves
     — 235 accepted links solved as one least-squares system in log
     altitude, median residual 0.194%. Values are ratios against the
     lowest surviving repeat frame. Absolute metres are gone.

   * matches are the real Lowe-filtered (0.55) ORB correspondences that survived
     RANSAC, in normalised frame coordinates: [teachX, teachY, repeatX, repeatY].

   * principal is the principal point from the calibration the flight used. The
     correction vector is aimed from there, not from the centre of the image.
   ========================================================================== */

export interface TeachRepeatMatch {
  0: number; 1: number; 2: number; 3: number;
}

export interface TeachRepeatFrame {
  /** Sequence id, f01 = highest surviving repeat frame. */
  id: string;
  /** Original recovered filename, kept so the claim stays checkable. */
  source: string;
  /** Repeat-frame altitude, as a ratio of the lowest surviving frame. */
  relAlt: number;
  /** Teach-frame altitude on the same relative scale. */
  relTeachAlt: number;
  /** relTeachAlt / relAlt — how far above its teach rung the aircraft was. */
  sigma: number;
  /** Lateral correction in centimetres, or null when the arrow clamped. */
  errCm: number | null;
  /** True when the true error exceeded the arrow's 0.40 m clamp. */
  clamped: boolean;
  /** Direction of the correction in image degrees, 0 = +x, 90 = down. */
  bearingDeg: number | null;
  /** The drawn arrow as a fraction of frame width / height. */
  arrow: { dx: number; dy: number };
  orb: {
    teach_kp: number;
    live_kp: number;
    matches: number;
    inliers: number;
    inlier_pct: number;
    rot_deg: number;
  };
  /** Mean luma of each half — the exposure gap ORB had to match across. */
  exposure: { teach: number; repeat: number };
  /** [teachX, teachY, repeatX, repeatY], all 0..1. */
  matches: number[][];
}

export const TEACH_REPEAT = {
  "principal": {
    "x": 0.54287,
    "y": 0.44182
  },
  "intrinsics": {
    "fx": 927.42,
    "fy": 930.11,
    "cx": 694.34,
    "cy": 317.67,
    "width": 1279,
    "height": 719
  },
  "recovery": {
    "filesCarved": 855,
    "uniqueFrames": 12,
    "scaleLinks": 235,
    "scaleResidualPct": 0.194
  },
  "frames": [
    {
      "id": "f01",
      "source": "u02_f179158328.png",
      "relAlt": 2.432,
      "relTeachAlt": 1.956,
      "sigma": 0.8045,
      "errCm": 17.5,
      "clamped": false,
      "bearingDeg": -160.5,
      "arrow": {
        "dx": -0.03232,
        "dy": -0.0204
      },
      "orb": {
        "teach_kp": 5805,
        "live_kp": 5430,
        "matches": 643,
        "inliers": 626,
        "inlier_pct": 97.4,
        "rot_deg": 1.1
      },
      "exposure": {
        "teach": 141.2,
        "repeat": 147.6
      },
      "matches": [
        [
          0.5106,
          0.5035,
          0.4824,
          0.4743
        ],
        [
          0.6708,
          0.1853,
          0.6138,
          0.2239
        ],
        [
          0.243,
          0.5157,
          0.2674,
          0.4771
        ],
        [
          0.2317,
          0.1869,
          0.2604,
          0.2128
        ],
        [
          0.1539,
          0.1385,
          0.1986,
          0.1711
        ],
        [
          0.456,
          0.4139,
          0.4394,
          0.4019
        ],
        [
          0.365,
          0.0818,
          0.3683,
          0.1307
        ],
        [
          0.5357,
          0.4974,
          0.5027,
          0.4715
        ],
        [
          0.7093,
          0.8662,
          0.6396,
          0.7733
        ],
        [
          0.684,
          0.2587,
          0.6231,
          0.2823
        ],
        [
          0.3406,
          0.7193,
          0.344,
          0.6439
        ],
        [
          0.2364,
          0.4106,
          0.2627,
          0.3922
        ],
        [
          0.6249,
          0.1719,
          0.577,
          0.2114
        ],
        [
          0.1107,
          0.267,
          0.1642,
          0.274
        ],
        [
          0.3744,
          0.9129,
          0.3698,
          0.7997
        ],
        [
          0.8172,
          0.6325,
          0.7279,
          0.5883
        ],
        [
          0.1679,
          0.7744,
          0.2056,
          0.6829
        ],
        [
          0.143,
          0.6048,
          0.1867,
          0.5458
        ],
        [
          0.8545,
          0.3986,
          0.76,
          0.4006
        ],
        [
          0.5674,
          0.7871,
          0.5254,
          0.7043
        ],
        [
          0.8363,
          0.6345,
          0.7431,
          0.5888
        ]
      ]
    },
    {
      "id": "f02",
      "source": "u06_f187635160.png",
      "relAlt": 2.265,
      "relTeachAlt": 1.825,
      "sigma": 0.8056,
      "errCm": 30.9,
      "clamped": false,
      "bearingDeg": -37.1,
      "arrow": {
        "dx": 0.04821,
        "dy": -0.06491
      },
      "orb": {
        "teach_kp": 5948,
        "live_kp": 5685,
        "matches": 383,
        "inliers": 295,
        "inlier_pct": 77.0,
        "rot_deg": 0.31
      },
      "exposure": {
        "teach": 135.3,
        "repeat": 148.4
      },
      "matches": [
        [
          0.2852,
          0.2403,
          0.3675,
          0.2782
        ],
        [
          0.243,
          0.4656,
          0.3323,
          0.459
        ],
        [
          0.41,
          0.3321,
          0.466,
          0.3519
        ],
        [
          0.4288,
          0.514,
          0.4808,
          0.4993
        ],
        [
          0.5958,
          0.489,
          0.6161,
          0.4812
        ],
        [
          0.38,
          0.0551,
          0.4425,
          0.1307
        ],
        [
          0.684,
          0.0818,
          0.6896,
          0.1516
        ],
        [
          0.5076,
          0.1836,
          0.5457,
          0.2323
        ],
        [
          0.2411,
          0.7761,
          0.3299,
          0.7079
        ],
        [
          0.2946,
          0.6509,
          0.3722,
          0.6078
        ],
        [
          0.5517,
          0.5791,
          0.5801,
          0.5535
        ],
        [
          0.1452,
          0.7631,
          0.2543,
          0.696
        ],
        [
          0.6796,
          0.3701,
          0.6857,
          0.3845
        ],
        [
          0.7218,
          0.7198,
          0.7182,
          0.6691
        ],
        [
          0.1595,
          0.6506,
          0.2659,
          0.6056
        ],
        [
          0.3922,
          0.7766,
          0.4514,
          0.7095
        ]
      ]
    },
    {
      "id": "f03",
      "source": "u07_f179164968.png",
      "relAlt": 2.251,
      "relTeachAlt": 1.867,
      "sigma": 0.8294,
      "errCm": 30.9,
      "clamped": false,
      "bearingDeg": -150.8,
      "arrow": {
        "dx": -0.05265,
        "dy": -0.05239
      },
      "orb": {
        "teach_kp": 5806,
        "live_kp": 5520,
        "matches": 774,
        "inliers": 618,
        "inlier_pct": 79.8,
        "rot_deg": 2.7
      },
      "exposure": {
        "teach": 141.8,
        "repeat": 147.7
      },
      "matches": [
        [
          0.4372,
          0.1636,
          0.405,
          0.1752
        ],
        [
          0.3528,
          0.6426,
          0.326,
          0.5661
        ],
        [
          0.5676,
          0.459,
          0.5051,
          0.4312
        ],
        [
          0.289,
          0.2971,
          0.2783,
          0.2768
        ],
        [
          0.4813,
          0.3321,
          0.4378,
          0.3199
        ],
        [
          0.1417,
          0.4373,
          0.1548,
          0.3811
        ],
        [
          0.531,
          0.5725,
          0.4738,
          0.5216
        ],
        [
          0.2336,
          0.2453,
          0.2338,
          0.2281
        ],
        [
          0.3218,
          0.7227,
          0.2987,
          0.63
        ],
        [
          0.2008,
          0.7944,
          0.1978,
          0.6801
        ],
        [
          0.85,
          0.1035,
          0.7443,
          0.1586
        ],
        [
          0.7815,
          0.3405,
          0.6841,
          0.3477
        ],
        [
          0.6765,
          0.1986,
          0.6005,
          0.2239
        ],
        [
          0.6296,
          0.1803,
          0.5629,
          0.2045
        ],
        [
          0.1661,
          0.6626,
          0.1712,
          0.5702
        ],
        [
          0.8763,
          0.4389,
          0.7584,
          0.4353
        ],
        [
          0.8313,
          0.5057,
          0.7209,
          0.4868
        ],
        [
          0.045,
          0.7944,
          0.068,
          0.6704
        ],
        [
          0.7476,
          0.7591,
          0.6474,
          0.6893
        ],
        [
          0.6485,
          0.8992,
          0.5639,
          0.7961
        ],
        [
          0.8836,
          0.5648,
          0.7611,
          0.5387
        ]
      ]
    },
    {
      "id": "f04",
      "source": "u05_f179221936.png",
      "relAlt": 2.129,
      "relTeachAlt": 1.808,
      "sigma": 0.8493,
      "errCm": 34.9,
      "clamped": false,
      "bearingDeg": 178.5,
      "arrow": {
        "dx": -0.06829,
        "dy": 0.00324
      },
      "orb": {
        "teach_kp": 5842,
        "live_kp": 5630,
        "matches": 531,
        "inliers": 445,
        "inlier_pct": 83.8,
        "rot_deg": 2.15
      },
      "exposure": {
        "teach": 141.9,
        "repeat": 147.3
      },
      "matches": [
        [
          0.6185,
          0.5021,
          0.5293,
          0.5063
        ],
        [
          0.2635,
          0.4715,
          0.2299,
          0.4604
        ],
        [
          0.3526,
          0.3115,
          0.3088,
          0.3296
        ],
        [
          0.258,
          0.1953,
          0.2291,
          0.2239
        ],
        [
          0.2158,
          0.6926,
          0.1853,
          0.6453
        ],
        [
          0.0591,
          0.5291,
          0.0532,
          0.4965
        ],
        [
          0.4879,
          0.1919,
          0.4253,
          0.2378
        ],
        [
          0.5029,
          0.3905,
          0.4339,
          0.4061
        ],
        [
          0.1651,
          0.3555,
          0.147,
          0.3561
        ],
        [
          0.0319,
          0.7777,
          0.0258,
          0.7079
        ],
        [
          0.4569,
          0.6025,
          0.3925,
          0.5828
        ],
        [
          0.5733,
          0.2403,
          0.4965,
          0.2837
        ],
        [
          0.1661,
          0.237,
          0.1493,
          0.2545
        ],
        [
          0.2571,
          0.8228,
          0.2189,
          0.7566
        ]
      ]
    },
    {
      "id": "f05",
      "source": "u04_f187572472.png",
      "relAlt": 1.98,
      "relTeachAlt": 1.761,
      "sigma": 0.8897,
      "errCm": 32.8,
      "clamped": false,
      "bearingDeg": 107.3,
      "arrow": {
        "dx": -0.01903,
        "dy": 0.10894
      },
      "orb": {
        "teach_kp": 5902,
        "live_kp": 5794,
        "matches": 325,
        "inliers": 289,
        "inlier_pct": 88.9,
        "rot_deg": 3.44
      },
      "exposure": {
        "teach": 140.9,
        "repeat": 146.7
      },
      "matches": [
        [
          0.269,
          0.37,
          0.2799,
          0.4395
        ],
        [
          0.6192,
          0.4298,
          0.5895,
          0.5271
        ],
        [
          0.4402,
          0.1641,
          0.4386,
          0.2754
        ],
        [
          0.4105,
          0.2629,
          0.4089,
          0.3602
        ],
        [
          0.2455,
          0.1391,
          0.2658,
          0.2337
        ],
        [
          0.2737,
          0.5841,
          0.2776,
          0.6314
        ],
        [
          0.638,
          0.7861,
          0.5958,
          0.8445
        ],
        [
          0.5254,
          0.0567,
          0.5168,
          0.1892
        ],
        [
          0.7131,
          0.3588,
          0.674,
          0.4743
        ],
        [
          0.1473,
          0.4506,
          0.1689,
          0.5007
        ],
        [
          0.4166,
          0.8896,
          0.3964,
          0.9179
        ],
        [
          0.35,
          0.731,
          0.3409,
          0.7691
        ],
        [
          0.7121,
          0.0818,
          0.6802,
          0.2295
        ],
        [
          0.2207,
          0.7611,
          0.2252,
          0.7844
        ],
        [
          0.9376,
          0.4182,
          0.8692,
          0.5468
        ],
        [
          0.1013,
          0.2163,
          0.1351,
          0.2884
        ],
        [
          0.7606,
          0.709,
          0.7059,
          0.7871
        ],
        [
          0.6372,
          0.597,
          0.5999,
          0.6777
        ],
        [
          0.9338,
          0.6489,
          0.8606,
          0.7498
        ],
        [
          0.1216,
          0.7095,
          0.1378,
          0.7282
        ]
      ]
    },
    {
      "id": "f06",
      "source": "u01_f187484968.png",
      "relAlt": 1.888,
      "relTeachAlt": 1.524,
      "sigma": 0.8071,
      "errCm": 12.1,
      "clamped": false,
      "bearingDeg": 177.5,
      "arrow": {
        "dx": -0.02372,
        "dy": 0.00185
      },
      "orb": {
        "teach_kp": 6000,
        "live_kp": 5793,
        "matches": 703,
        "inliers": 483,
        "inlier_pct": 68.7,
        "rot_deg": 1.86
      },
      "exposure": {
        "teach": 140.1,
        "repeat": 146.9
      },
      "matches": [
        [
          0.5808,
          0.5791,
          0.5668,
          0.5814
        ],
        [
          0.6934,
          0.2854,
          0.6638,
          0.3463
        ],
        [
          0.38,
          0.7193,
          0.4019,
          0.6843
        ],
        [
          0.4231,
          0.2854,
          0.4441,
          0.3338
        ],
        [
          0.1952,
          0.7494,
          0.2549,
          0.6982
        ],
        [
          0.3068,
          0.2837,
          0.3503,
          0.3268
        ],
        [
          0.2805,
          0.207,
          0.3307,
          0.2656
        ],
        [
          0.1633,
          0.8195,
          0.2275,
          0.7524
        ],
        [
          0.5245,
          0.3755,
          0.5246,
          0.4117
        ],
        [
          0.4072,
          0.8645,
          0.4222,
          0.8039
        ],
        [
          0.2383,
          0.7694,
          0.2885,
          0.7163
        ],
        [
          0.6774,
          0.1836,
          0.6521,
          0.2615
        ],
        [
          0.4119,
          0.1886,
          0.4355,
          0.2545
        ],
        [
          0.5517,
          0.1936,
          0.5489,
          0.2656
        ],
        [
          0.1654,
          0.7475,
          0.2302,
          0.695
        ]
      ]
    },
    {
      "id": "f07",
      "source": "u08_f187627808.png",
      "relAlt": 1.747,
      "relTeachAlt": 1.341,
      "sigma": 0.7675,
      "errCm": null,
      "clamped": true,
      "bearingDeg": -91.3,
      "arrow": {
        "dx": -0.00183,
        "dy": -0.1414
      },
      "orb": {
        "teach_kp": 6000,
        "live_kp": 5825,
        "matches": 278,
        "inliers": 206,
        "inlier_pct": 74.1,
        "rot_deg": -0.82
      },
      "exposure": {
        "teach": 137.4,
        "repeat": 146.8
      },
      "matches": [
        [
          0.2524,
          0.3104,
          0.3049,
          0.1989
        ],
        [
          0.578,
          0.454,
          0.5567,
          0.3032
        ],
        [
          0.1933,
          0.1919,
          0.258,
          0.1071
        ],
        [
          0.4579,
          0.1535,
          0.4636,
          0.0737
        ],
        [
          0.4166,
          0.3204,
          0.4324,
          0.2045
        ],
        [
          0.2195,
          0.6008,
          0.2815,
          0.4242
        ],
        [
          0.5498,
          0.5024,
          0.5364,
          0.3408
        ],
        [
          0.2261,
          0.8261,
          0.2885,
          0.5981
        ],
        [
          0.1464,
          0.5257,
          0.2236,
          0.3686
        ],
        [
          0.3987,
          0.8312,
          0.4214,
          0.5967
        ],
        [
          0.4513,
          0.7043,
          0.4613,
          0.4979
        ],
        [
          0.1452,
          0.4606,
          0.2224,
          0.3171
        ],
        [
          0.685,
          0.6609,
          0.6399,
          0.459
        ],
        [
          0.0878,
          0.7595,
          0.1801,
          0.5488
        ]
      ]
    },
    {
      "id": "f08",
      "source": "u09_f200469184.png",
      "relAlt": 1.377,
      "relTeachAlt": 0.673,
      "sigma": 0.4886,
      "errCm": 8.6,
      "clamped": false,
      "bearingDeg": 63.4,
      "arrow": {
        "dx": 0.00755,
        "dy": 0.02688
      },
      "orb": {
        "teach_kp": 6000,
        "live_kp": 6000,
        "matches": 118,
        "inliers": 94,
        "inlier_pct": 79.7,
        "rot_deg": 1.96
      },
      "exposure": {
        "teach": 116.2,
        "repeat": 143.9
      },
      "matches": [
        [
          0.785,
          0.4302,
          0.6615,
          0.4993
        ],
        [
          0.475,
          0.2451,
          0.5106,
          0.3992
        ],
        [
          0.4653,
          0.2567,
          0.5059,
          0.4047
        ],
        [
          0.2318,
          0.7181,
          0.3862,
          0.6231
        ],
        [
          0.8495,
          0.6893,
          0.6912,
          0.63
        ],
        [
          0.6874,
          0.5508,
          0.6122,
          0.5549
        ],
        [
          0.655,
          0.571,
          0.5958,
          0.5661
        ],
        [
          0.6534,
          0.4701,
          0.595,
          0.5146
        ],
        [
          0.2432,
          0.2596,
          0.3972,
          0.3992
        ],
        [
          0.1184,
          0.6893,
          0.3307,
          0.6064
        ],
        [
          0.1005,
          0.7643,
          0.3206,
          0.6426
        ],
        [
          0.356,
          0.5295,
          0.4485,
          0.5341
        ],
        [
          0.8424,
          0.1627,
          0.6905,
          0.3688
        ],
        [
          0.8778,
          0.3862,
          0.7071,
          0.4807
        ],
        [
          0.7027,
          0.2367,
          0.6226,
          0.4006
        ]
      ]
    },
    {
      "id": "f09",
      "source": "u10_f200416568.png",
      "relAlt": 1.195,
      "relTeachAlt": 0.798,
      "sigma": 0.6674,
      "errCm": 23.5,
      "clamped": false,
      "bearingDeg": -3.6,
      "arrow": {
        "dx": 0.04586,
        "dy": -0.0051
      },
      "orb": {
        "teach_kp": 6000,
        "live_kp": 6000,
        "matches": 359,
        "inliers": 262,
        "inlier_pct": 73.0,
        "rot_deg": 1.29
      },
      "exposure": {
        "teach": 127.9,
        "repeat": 142.4
      },
      "matches": [
        [
          0.6727,
          0.8762,
          0.6912,
          0.7344
        ],
        [
          0.6553,
          0.8372,
          0.6794,
          0.7065
        ],
        [
          0.5517,
          0.3084,
          0.6138,
          0.3477
        ],
        [
          0.6969,
          0.6829,
          0.7091,
          0.6036
        ],
        [
          0.4109,
          0.1021,
          0.5207,
          0.2072
        ],
        [
          0.3029,
          0.3144,
          0.4464,
          0.3463
        ],
        [
          0.4504,
          0.6269,
          0.5434,
          0.5591
        ],
        [
          0.5314,
          0.5027,
          0.5989,
          0.4784
        ],
        [
          0.3997,
          0.2804,
          0.5121,
          0.3268
        ],
        [
          0.331,
          0.1923,
          0.4676,
          0.2656
        ],
        [
          0.6947,
          0.1983,
          0.7115,
          0.2768
        ],
        [
          0.5539,
          0.1082,
          0.6169,
          0.2142
        ],
        [
          0.2837,
          0.5207,
          0.4332,
          0.484
        ],
        [
          0.8647,
          0.3485,
          0.8256,
          0.3825
        ],
        [
          0.8336,
          0.1466,
          0.8069,
          0.2453
        ],
        [
          0.8398,
          0.5364,
          0.8073,
          0.5087
        ],
        [
          0.7458,
          0.372,
          0.7442,
          0.3945
        ],
        [
          0.4763,
          0.7683,
          0.5593,
          0.6547
        ]
      ]
    },
    {
      "id": "f10",
      "source": "u11_f200477032.png",
      "relAlt": 1.159,
      "relTeachAlt": 0.491,
      "sigma": 0.4232,
      "errCm": 13.2,
      "clamped": false,
      "bearingDeg": -149.5,
      "arrow": {
        "dx": -0.02216,
        "dy": -0.02318
      },
      "orb": {
        "teach_kp": 6000,
        "live_kp": 6000,
        "matches": 38,
        "inliers": 37,
        "inlier_pct": 97.4,
        "rot_deg": 3.18
      },
      "exposure": {
        "teach": 110.0,
        "repeat": 141.5
      },
      "matches": [
        [
          0.3388,
          0.4038,
          0.4183,
          0.395
        ],
        [
          0.5755,
          0.6201,
          0.5168,
          0.4965
        ],
        [
          0.7393,
          0.5681,
          0.5848,
          0.4826
        ],
        [
          0.8735,
          0.3634,
          0.6443,
          0.4019
        ],
        [
          0.4436,
          0.1177,
          0.4668,
          0.2796
        ],
        [
          0.1887,
          0.6541,
          0.3526,
          0.4951
        ],
        [
          0.2568,
          0.8548,
          0.3776,
          0.5828
        ],
        [
          0.0875,
          0.4188,
          0.3127,
          0.3908
        ],
        [
          0.0798,
          0.6679,
          0.3057,
          0.4965
        ],
        [
          0.9241,
          0.5607,
          0.663,
          0.4868
        ],
        [
          0.7626,
          0.1938,
          0.5997,
          0.3255
        ],
        [
          0.1751,
          0.2326,
          0.3528,
          0.3171
        ],
        [
          0.4959,
          0.5133,
          0.4841,
          0.4486
        ]
      ]
    },
    {
      "id": "f11",
      "source": "u03_f200453272.png",
      "relAlt": 1.086,
      "relTeachAlt": 0.704,
      "sigma": 0.6486,
      "errCm": 13.3,
      "clamped": false,
      "bearingDeg": 113.7,
      "arrow": {
        "dx": -0.01043,
        "dy": 0.04218
      },
      "orb": {
        "teach_kp": 6000,
        "live_kp": 6000,
        "matches": 195,
        "inliers": 117,
        "inlier_pct": 60.0,
        "rot_deg": 3.47
      },
      "exposure": {
        "teach": 125.2,
        "repeat": 139.2
      },
      "matches": [
        [
          0.5078,
          0.5808,
          0.4973,
          0.6398
        ],
        [
          0.4413,
          0.6289,
          0.4535,
          0.6676
        ],
        [
          0.671,
          0.8812,
          0.5973,
          0.8512
        ],
        [
          0.2477,
          0.743,
          0.3268,
          0.7274
        ],
        [
          0.197,
          0.8532,
          0.2916,
          0.7942
        ],
        [
          0.581,
          0.8532,
          0.5395,
          0.8248
        ],
        [
          0.3794,
          0.2383,
          0.4214,
          0.4089
        ],
        [
          0.5427,
          0.4967,
          0.5223,
          0.5883
        ],
        [
          0.7825,
          0.1302,
          0.6865,
          0.3658
        ],
        [
          0.7059,
          0.2544,
          0.6333,
          0.4423
        ],
        [
          0.2398,
          0.2784,
          0.3315,
          0.427
        ],
        [
          0.2513,
          0.0793,
          0.3432,
          0.3004
        ],
        [
          0.3988,
          0.4984,
          0.4283,
          0.5792
        ],
        [
          0.6981,
          0.6313,
          0.6209,
          0.6893
        ],
        [
          0.3852,
          0.7974,
          0.4134,
          0.7729
        ]
      ]
    },
    {
      "id": "f12",
      "source": "u00_f200460648.png",
      "relAlt": 1.0,
      "relTeachAlt": 0.527,
      "sigma": 0.527,
      "errCm": 26.3,
      "clamped": false,
      "bearingDeg": 115.5,
      "arrow": {
        "dx": -0.02216,
        "dy": 0.08252
      },
      "orb": {
        "teach_kp": 6000,
        "live_kp": 6000,
        "matches": 72,
        "inliers": 58,
        "inlier_pct": 80.6,
        "rot_deg": 4.63
      },
      "exposure": {
        "teach": 117.4,
        "repeat": 139.0
      },
      "matches": [
        [
          0.1702,
          0.6705,
          0.294,
          0.7093
        ],
        [
          0.1175,
          0.3749,
          0.2729,
          0.5508
        ],
        [
          0.2216,
          0.3725,
          0.3284,
          0.5577
        ],
        [
          0.0905,
          0.721,
          0.2494,
          0.7302
        ],
        [
          0.2526,
          0.8868,
          0.3323,
          0.8303
        ],
        [
          0.2567,
          0.2091,
          0.3503,
          0.4757
        ],
        [
          0.5539,
          0.4975,
          0.4996,
          0.6495
        ],
        [
          0.3634,
          0.423,
          0.4011,
          0.5953
        ],
        [
          0.5188,
          0.6537,
          0.4777,
          0.726
        ],
        [
          0.1135,
          0.7671,
          0.2604,
          0.7566
        ],
        [
          0.4507,
          0.1125,
          0.4543,
          0.4409
        ],
        [
          0.5269,
          0.7844,
          0.4785,
          0.7955
        ],
        [
          0.677,
          0.1177,
          0.5704,
          0.4623
        ],
        [
          0.4864,
          0.5987,
          0.4616,
          0.696
        ],
        [
          0.1323,
          0.1315,
          0.2862,
          0.4256
        ],
        [
          0.4389,
          0.8555,
          0.4312,
          0.8251
        ]
      ]
    }
  ]
} as const;

export const FRAMES: readonly TeachRepeatFrame[] =
  TEACH_REPEAT.frames as unknown as readonly TeachRepeatFrame[];

/** Asset path for one half of a recovered pair. */
export function framePath(id: string, half: "teach" | "repeat"): string {
  return `/media/teach-repeat/${id}-${half}.webp`;
}
