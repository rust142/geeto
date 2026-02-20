# typed: false
# frozen_string_literal: true

class Geeto < Formula
  desc "AI-powered Git workflow automation CLI"
  homepage "https://github.com/rust142/geeto"
  version "0.3.5"
  license "MIT"

  on_macos do
    if Hardware::CPU.intel?
      url "https://github.com/rust142/geeto/releases/download/v0.3.5/geeto-mac"
      sha256 "d3cfae7ac1354f62afcaaadc7ed766f097b1449b81fabac160856fdf3e558b37"

      def install
        bin.install "geeto-mac" => "geeto"
      end
    elsif Hardware::CPU.arm?
      url "https://github.com/rust142/geeto/releases/download/v0.3.5/geeto-mac-arm64"
      sha256 "95391ec6dcaa39c60df6f994c2d5dcbacc7bd8cf6ca877923b2a1c44c2a97b89"

      def install
        bin.install "geeto-mac-arm64" => "geeto"
      end
    end
  end

  on_linux do
    if Hardware::CPU.intel?
      url "https://github.com/rust142/geeto/releases/download/v0.3.5/geeto-linux"
      sha256 "47d20ed4ef82e4128b929e9dbaab4ea1fab34ab8ea5735baa811374c3988a595"

      def install
        bin.install "geeto-linux" => "geeto"
      end
    elsif Hardware::CPU.arm?
      url "https://github.com/rust142/geeto/releases/download/v0.3.5/geeto-linux-arm64"
      sha256 "c3eaa2f472cb4c47d36a3c07b8f884670ba5f794732b82795136fc4595d92aed"

      def install
        bin.install "geeto-linux-arm64" => "geeto"
      end
    end
  end

  test do
    assert_match "Geeto v\#{version}", shell_output("\#{bin}/geeto --version")
  end
end
